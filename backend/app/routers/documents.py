import uuid
from datetime import date, datetime
from typing import Optional
from urllib.parse import quote

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import extract, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.document import Document
from app.models.user import User
from app.schemas.document import (
    DOC_TYPES,
    DocumentListResponse,
    DocumentResponse,
    DocumentUpdateRequest,
    DocumentUploadResponse,
)
from app.services import audit, storage

router = APIRouter()

SORT_COLUMNS = {
    "created_at": Document.created_at,
    "title": Document.title,
    "display_id": Document.display_id,
    "updated_at": Document.updated_at,
}


def _parse_uuid(value: Optional[str], field: str) -> Optional[uuid.UUID]:
    if value is None or value == "":
        return None
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field} must be a valid UUID",
        )


def _parse_sort(sort: Optional[str]):
    if not sort:
        return Document.created_at.desc()
    parts = sort.split(":")
    col = SORT_COLUMNS.get(parts[0])
    if col is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown sort column. Allowed: {', '.join(SORT_COLUMNS)}",
        )
    direction = parts[1] if len(parts) > 1 else "desc"
    return col.asc() if direction == "asc" else col.desc()


@router.post(
    "/upload",
    response_model=list[DocumentUploadResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_documents(
    http_request: Request,
    files: list[UploadFile] = File(...),
    folder_id: Optional[str] = Form(None),
    department_id: Optional[str] = Form(None),
    doc_type: Optional[str] = Form(None),
    physical_location: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    folder_uuid = _parse_uuid(folder_id, "folder_id")
    department_uuid = _parse_uuid(department_id, "department_id")
    if doc_type is not None and doc_type not in DOC_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"doc_type must be one of: {', '.join(sorted(DOC_TYPES))}",
        )

    created: list[Document] = []

    for file in files:
        if file.content_type not in ("application/pdf", "application/octet-stream"):
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
            folder_id=folder_uuid,
            department_id=department_uuid,
            doc_type=doc_type,
            physical_location=physical_location,
        )
        db.add(doc)
        await db.flush()
        await audit.log(
            db,
            user_id=current_user.id,
            action="document.upload",
            entity_type="document",
            entity_id=doc.id,
            metadata={"filename": file.filename, "size": len(data)},
            request=http_request,
        )
        created.append(doc)

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
    doc_type: Optional[str] = None,
    folder_id: Optional[uuid.UUID] = None,
    department_id: Optional[uuid.UUID] = None,
    year: Optional[int] = None,
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    sort: Optional[str] = None,
    q: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Org-wide visibility: every authenticated user sees every document.
    base_query = select(Document)
    if ocr_status:
        base_query = base_query.where(Document.ocr_status == ocr_status)
    if doc_type:
        base_query = base_query.where(Document.doc_type == doc_type)
    if folder_id:
        base_query = base_query.where(Document.folder_id == folder_id)
    if department_id:
        base_query = base_query.where(Document.department_id == department_id)
    if year:
        base_query = base_query.where(extract("year", Document.created_at) == year)
    if created_from:
        base_query = base_query.where(Document.created_at >= created_from)
    if created_to:
        base_query = base_query.where(Document.created_at <= created_to)
    if q:
        base_query = base_query.where(
            or_(
                Document.title.ilike(f"%{q}%"),
                text("documents.search_vector @@ plainto_tsquery('simple', :q)").bindparams(q=q),
            )
        )

    total = await db.scalar(select(func.count()).select_from(base_query.subquery()))

    order_by = _parse_sort(sort)
    docs = (
        await db.scalars(
            base_query.order_by(order_by)
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
    _: User = Depends(get_current_user),
):
    return await _get_document(db, document_id)


@router.patch("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: uuid.UUID,
    request: DocumentUpdateRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_document(db, document_id)
    _require_write(doc, current_user)

    update_data = request.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(doc, field, value)

    await audit.log(
        db,
        user_id=current_user.id,
        action="document.update",
        entity_type="document",
        entity_id=doc.id,
        metadata=update_data,
        request=http_request,
    )

    await db.commit()
    await db.refresh(doc)
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_document(db, document_id)
    _require_write(doc, current_user)

    await storage.delete_file(doc.file_path)
    await db.delete(doc)
    await audit.log(
        db,
        user_id=current_user.id,
        action="document.delete",
        entity_type="document",
        entity_id=document_id,
        metadata={"title": doc.title, "display_id": doc.display_id},
        request=http_request,
    )
    await db.commit()


@router.get("/{document_id}/file")
async def get_document_file(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = await _get_document(db, document_id)

    file_stream = storage.get_file_stream(doc.file_path)

    def iter_stream():
        try:
            for chunk in file_stream.stream(amt=65536):
                yield chunk
        finally:
            file_stream.close()
            file_stream.release_conn()

    filename = doc.original_filename or f"{doc.title}.pdf"
    ascii_fallback = filename.encode("ascii", "replace").decode("ascii").replace('"', "")
    content_disposition = (
        f'inline; filename="{ascii_fallback}"; '
        f"filename*=UTF-8''{quote(filename)}"
    )
    return StreamingResponse(
        iter_stream(),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )


@router.get("/{document_id}/ocr-text")
async def get_ocr_text(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    doc = await _get_document(db, document_id)
    if doc.ocr_status != "completed":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"OCR text not available. Status: {doc.ocr_status}",
        )
    return {"document_id": str(document_id), "ocr_text": doc.ocr_text}


@router.post("/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
async def reprocess_document(
    document_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_document(db, document_id)
    _require_write(doc, current_user)

    doc.ocr_status = "pending"
    doc.ocr_retry_count = 0
    doc.ocr_error = None
    await audit.log(
        db,
        user_id=current_user.id,
        action="document.reprocess",
        entity_type="document",
        entity_id=doc.id,
        request=http_request,
    )
    await db.commit()

    from arq import create_pool
    from arq.connections import RedisSettings

    pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await pool.enqueue_job("process_document", str(document_id))
    await pool.aclose()

    return {"message": "Reprocessing queued", "document_id": str(document_id)}


async def _get_document(db: AsyncSession, document_id: uuid.UUID) -> Document:
    doc = await db.scalar(select(Document).where(Document.id == document_id))
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return doc


def _require_write(doc: Document, user: User) -> None:
    if doc.user_id != user.id and user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the uploader or an administrator can modify this document",
        )
