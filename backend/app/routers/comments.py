import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.comment import DocumentComment
from app.models.document import Document
from app.models.user import User
from app.schemas.comment import (
    CommentAuthor,
    CommentCreateRequest,
    CommentResponse,
)
from app.services import audit
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


def _to_response(
    comment: DocumentComment, author: User
) -> CommentResponse:
    return CommentResponse(
        id=comment.id,
        document_id=comment.document_id,
        user_id=comment.user_id,
        body=comment.body,
        created_at=comment.created_at,
        author=CommentAuthor(
            id=author.id, full_name=author.full_name, email=author.email
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

    comment = DocumentComment(
        id=uuid.uuid4(),
        document_id=doc.id,
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

    # Notify uploader (unless mentioned — they'll get the louder mention ping)
    if doc.user_id not in valid_mention_ids:
        await notify(
            db,
            user_id=doc.user_id,
            type_="comment_added",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": payload.body[:160]},
        )
    # While the doc is awaiting a decision, also notify dept managers so they
    # see comments that might change their review. After approval/rejection,
    # skip to avoid notification spam on archive-stage discussions.
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
            payload={"title": doc.title, "preview": payload.body[:160]},
        )
    # Fire mention notifications (skip self).
    if valid_mention_ids:
        await notify_many(
            db,
            user_ids=[uid for uid in valid_mention_ids if uid != current_user.id],
            type_="comment_mention",
            document_id=doc.id,
            actor_id=current_user.id,
            payload={"title": doc.title, "preview": payload.body[:160]},
        )

    await db.commit()
    await db.refresh(comment)
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
