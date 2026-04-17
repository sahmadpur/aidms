import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text

from app.core.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.user import User
from app.schemas.document import (
    DocumentUploadResponse,
    DocumentResponse,
    DocumentListResponse,
    DocumentUpdateRequest,
)
from app.services import storage

router = APIRouter()


@router.post("/upload", response_model=list[DocumentUploadResponse], status_code=status.HTTP_201_CREATED)
async def upload_documents(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    created = []

    for file in files:
        if file.content_type not in ("application/pdf", "application/octet-stream"):
            # Allow octet-stream as some browsers send it for PDFs
            if not (file.filename or "").lower().endswith(".pdf"):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"File '{file.filename}' is not a PDF",
                )

        data = await file.read()
        if len(data) > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{file.filename}' exceeds {settings.max_upload_size_mb}MB limit",
            )

        object_key = await storage.upload_file(data, file.filename or "document.pdf")

        doc = Document(
            id=uuid.uuid4(),
            user_id=current_user.id,
            title=(file.filename or "Untitled").rsplit(".", 1)[0],
            original_filename=file.filename,
            file_path=object_key,
            file_size_bytes=len(data),
            ocr_status="pending",
        )
        db.add(doc)
        await db.flush()
        created.append(doc)

        # Enqueue OCR job
        try:
            from arq import create_pool
            from arq.connections import RedisSettings
            pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
            await pool.enqueue_job("process_document", str(doc.id))
            await pool.aclose()
        except Exception:
            pass  # OCR will retry or can be triggered manually

    await db.commit()
    for doc in created:
        await db.refresh(doc)

    return created


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    ocr_status: Optional[str] = None,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = select(Document).where(Document.user_id == current_user.id)
    if ocr_status:
        base_query = base_query.where(Document.ocr_status == ocr_status)
    if q:
        base_query = base_query.where(
            or_(
                Document.title.ilike(f"%{q}%"),
                text("documents.search_vector @@ plainto_tsquery('simple', :q)").bindparams(q=q),
            )
        )

    total = await db.scalar(
        select(func.count()).select_from(base_query.subquery())
    )
    docs = (
        await db.scalars(
            base_query.order_by(Document.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    return DocumentListResponse(
        items=docs, total=total or 0, page=page, page_size=page_size
    )


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)
    return doc


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    request: DocumentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(doc, field, value)

    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)
    await storage.delete_file(doc.file_path)
    await db.delete(doc)
    await db.commit()


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)

    file_stream = storage.get_file_stream(doc.file_path)

    def iter_stream():
        try:
            for chunk in file_stream.stream(amt=65536):
                yield chunk
        finally:
            file_stream.close()
            file_stream.release_conn()

    filename = doc.original_filename or f"{doc.title}.pdf"
    return StreamingResponse(
        iter_stream(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/{document_id}/ocr-text")
async def get_ocr_text(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)
    if doc.ocr_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OCR text not available. Status: {doc.ocr_status}",
        )
    return {"document_id": str(document_id), "ocr_text": doc.ocr_text}


@router.post("/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_document(db, document_id, current_user.id)

    doc.ocr_status = "pending"
    doc.ocr_retry_count = 0
    doc.ocr_error = None
    await db.commit()

    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job("process_document", str(document_id))
    await pool.aclose()

    return {"message": "Reprocessing queued", "document_id": str(document_id)}


async def _get_owned_document(
    db: AsyncSession, document_id: uuid.UUID, user_id: uuid.UUID
) -> Document:
    doc = await db.scalar(
        select(Document).where(
            Document.id == document_id, Document.user_id == user_id
        )
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )
    return doc
