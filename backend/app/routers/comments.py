import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.annotation import DocumentAnnotation
from app.models.comment import DocumentComment
from app.models.document import Document
from app.models.user import User
from app.schemas.annotation import AnnotationCreate, AnnotationResponse
from app.schemas.comment import (
    CommentAuthor,
    CommentCreateRequest,
    CommentResponse,
)
from app.core.config import settings
from app.services import audit
from app.services.email import email_user, email_users
from app.services.notifications import managers_of, notify, notify_many
from app.services.visibility import visible_documents_clause

router = APIRouter()

MENTION_RE = re.compile(
    r"@\[(?P<name>[^\]]{1,80})\]\((?P<id>[0-9a-fA-F-]{36})\)"
)


def _extract_mention_ids(body: str) -> list[uuid.UUID]:
    """Parse `@[Full Name](uuid)` tokens and return deduplicated UUIDs."""
    seen: set[uuid.UUID] = set()
    ordered: list[uuid.UUID] = []
    for match in MENTION_RE.finditer(body):
        try:
            uid = uuid.UUID(match.group("id"))
        except ValueError:
            continue
        if uid not in seen:
            seen.add(uid)
            ordered.append(uid)
    return ordered


async def _load_document(
    db: AsyncSession, document_id: uuid.UUID, user: User
) -> Document:
    doc = await db.scalar(
        select(Document)
        .where(Document.id == document_id)
        .where(visible_documents_clause(user))
    )
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return doc


def _clean_preview(body: str) -> str:
    """Strip mention markup for human-readable previews."""
    return MENTION_RE.sub(lambda m: "@" + m.group("name"), body)[:160]


def _to_response(
    comment: DocumentComment, author: User
) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        document_id=comment.document_id,
        user_id=comment.user_id,
        parent_id=comment.parent_id,
        body=comment.body,
        is_resolved=comment.is_resolved,
        resolved_by=comment.resolved_by,
        resolved_at=comment.resolved_at,
        created_at=comment.created_at,
        author=CommentAuthor(
            id=author.id,
            full_name=author.full_name,
            email=author.email,
            avatar_url=author.avatar_url,
            updated_at=author.updated_at,
        ),
    )


@router.get("/{document_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_document(db, document_id, current_user)

    rows = (
        await db.execute(
            select(DocumentComment, User)
            .join(User, User.id == DocumentComment.user_id)
            .where(DocumentComment.document_id == document_id)
            .order_by(DocumentComment.created_at.asc())
        )
    ).all()
    return [_to_response(c, u) for c, u in rows]


@router.post(
    "/{document_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    document_id: uuid.UUID,
    payload: CommentCreateRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _load_document(db, document_id, current_user)

    if payload.parent_id:
        parent = await db.scalar(
            select(DocumentComment)
            .where(DocumentComment.id == payload.parent_id)
            .where(DocumentComment.document_id == document_id)
        )
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent comment not found in this document",
            )

    comment = DocumentComment(
        id=uuid.uuid4(),
        document_id=doc.id,
        parent_id=payload.parent_id,
        user_id=current_user.id,
        body=payload.body,
    )
    db.add(comment)
    await db.flush()

    await audit.log(
        db,
        user_id=current_user.id,
        action="comment.create",
        entity_type="document_comment",
        entity_id=comment.id,
        metadata={"document_id": str(doc.id)},
        request=http_request,
    )

    # Collect mentioned user ids and validate they exist.
    mention_ids = _extract_mention_ids(payload.body)
    valid_mention_ids: set[uuid.UUID] = set()
    if mention_ids:
        found = await db.execute(
            select(User.id).where(User.id.in_(mention_ids))
        )
        valid_mention_ids = {row[0] for row in found.all()}

    preview = _clean_preview(payload.body)
    common_email_context = {
        "actor_name": current_user.full_name,
        "doc_title": doc.title,
        "comment_preview": preview,
        "doc_url": f"{settings.frontend_base_url}/documents/{doc.id}",
    }

    # Notify uploader (unless mentioned — they'll get the louder mention ping)
    if doc.user_id not in valid_mention_ids and doc.user_id != current_user.id:
        await notify(
            db,
            user_id=doc.user_id,
            type_="comment_added",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": preview},
        )

    # While the doc is awaiting a decision, also notify dept managers so they
    # see comments that might change their review. After approval/rejection,
    # skip to avoid notification spam on archive-stage discussions.
    managers_to_notify: list[uuid.UUID] = []
    if doc.approval_status in ("pending", "revision_requested"):
        manager_ids = await managers_of(db, doc.department_id)
        managers_to_notify = [
            mid for mid in manager_ids
            if mid != doc.user_id and mid not in valid_mention_ids
        ]
        await notify_many(
            db,
            user_ids=managers_to_notify,
            type_="comment_added",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": preview},
        )

    # Fire mention notifications (skip self).
    mention_recipients = [uid for uid in valid_mention_ids if uid != current_user.id]
    if mention_recipients:
        await notify_many(
            db,
            user_ids=mention_recipients,
            type_="comment_mention",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": preview},
        )

    await db.commit()
    await db.refresh(comment)

    # Email after commit so a successful comment post never fails on SMTP.
    if doc.user_id not in valid_mention_ids and doc.user_id != current_user.id:
        await email_user(
            db,
            user_id=doc.user_id,
            event="comment_added",
            context=common_email_context,
        )
    if managers_to_notify:
        await email_users(
            db,
            user_ids=managers_to_notify,
            event="comment_added",
            context=common_email_context,
            exclude_user_id=current_user.id,
        )
    if mention_recipients:
        await email_users(
            db,
            user_ids=mention_recipients,
            event="comment_mention",
            context=common_email_context,
            exclude_user_id=current_user.id,
        )

    return _to_response(comment, current_user)


@router.delete(
    "/{document_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_document(db, document_id, current_user)
    comment = await db.scalar(
        select(DocumentComment)
        .where(DocumentComment.id == comment_id)
        .where(DocumentComment.document_id == document_id)
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )
    if comment.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the comment author or an administrator can delete this comment",
        )

    await db.delete(comment)
    await audit.log(
        db,
        user_id=current_user.id,
        action="comment.delete",
        entity_type="document_comment",
        entity_id=comment_id,
        metadata={"document_id": str(document_id)},
        request=http_request,
    )
    await db.commit()


@router.post(
    "/{document_id}/comments/{comment_id}/resolve",
    response_model=CommentResponse,
)
async def resolve_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_document(db, document_id, current_user)
    comment = await db.scalar(
        select(DocumentComment)
        .where(DocumentComment.id == comment_id)
        .where(DocumentComment.document_id == document_id)
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )
    if comment.parent_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only top-level comments can be resolved",
        )
    from datetime import datetime, timezone

    comment.is_resolved = True
    comment.resolved_by = current_user.id
    comment.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(comment)

    author = await db.get(User, comment.user_id)
    return _to_response(comment, author)


@router.post(
    "/{document_id}/comments/{comment_id}/unresolve",
    response_model=CommentResponse,
)
async def unresolve_comment(
    document_id: uuid.UUID,
    comment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_document(db, document_id, current_user)
    comment = await db.scalar(
        select(DocumentComment)
        .where(DocumentComment.id == comment_id)
        .where(DocumentComment.document_id == document_id)
    )
    if comment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found"
        )

    comment.is_resolved = False
    comment.resolved_by = None
    comment.resolved_at = None
    await db.commit()
    await db.refresh(comment)

    author = await db.get(User, comment.user_id)
    return _to_response(comment, author)


@router.post(
    "/{document_id}/annotations",
    response_model=AnnotationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_annotation(
    document_id: uuid.UUID,
    payload: AnnotationCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _load_document(db, document_id, current_user)

    comment = DocumentComment(
        id=uuid.uuid4(),
        document_id=doc.id,
        user_id=current_user.id,
        body=payload.comment_body,
    )
    db.add(comment)
    await db.flush()

    annotation = DocumentAnnotation(
        id=uuid.uuid4(),
        document_id=doc.id,
        comment_id=comment.id,
        page_number=payload.page_number,
        highlight_rects=[r.model_dump() for r in payload.highlight_rects],
        selected_text=payload.selected_text,
        color=payload.color,
    )
    db.add(annotation)
    await db.flush()

    await audit.log(
        db,
        user_id=current_user.id,
        action="comment.create",
        entity_type="document_comment",
        entity_id=comment.id,
        metadata={"document_id": str(doc.id), "annotation": True},
        request=http_request,
    )

    mention_ids = _extract_mention_ids(payload.comment_body)
    valid_mention_ids: set[uuid.UUID] = set()
    if mention_ids:
        found = await db.execute(
            select(User.id).where(User.id.in_(mention_ids))
        )
        valid_mention_ids = {row[0] for row in found.all()}

    preview = _clean_preview(payload.comment_body)
    mention_recipients = [uid for uid in valid_mention_ids if uid != current_user.id]
    if mention_recipients:
        await notify_many(
            db,
            user_ids=mention_recipients,
            type_="comment_mention",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": preview},
        )

    await db.commit()
    await db.refresh(annotation)

    return AnnotationResponse(
        id=annotation.id,
        document_id=annotation.document_id,
        comment_id=annotation.comment_id,
        page_number=annotation.page_number,
        highlight_rects=annotation.highlight_rects,
        selected_text=annotation.selected_text,
        color=annotation.color,
        created_at=annotation.created_at,
    )


@router.get("/{document_id}/annotations", response_model=list[AnnotationResponse])
async def list_annotations(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _load_document(db, document_id, current_user)

    rows = (
        await db.execute(
            select(DocumentAnnotation)
            .where(DocumentAnnotation.document_id == document_id)
            .order_by(DocumentAnnotation.page_number, DocumentAnnotation.created_at)
        )
    ).scalars().all()

    return [
        AnnotationResponse(
            id=a.id,
            document_id=a.document_id,
            comment_id=a.comment_id,
            page_number=a.page_number,
            highlight_rects=a.highlight_rects,
            selected_text=a.selected_text,
            color=a.color,
            created_at=a.created_at,
        )
        for a in rows
    ]
