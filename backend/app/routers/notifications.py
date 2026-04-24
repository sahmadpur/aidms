import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    MarkReadRequest,
    NotificationActor,
    NotificationListResponse,
    NotificationResponse,
)

router = APIRouter()


def _to_response(n: Notification, actor: Optional[User]) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        user_id=n.user_id,
        actor=NotificationActor(id=actor.id, full_name=actor.full_name)
        if actor is not None
        else None,
        type=n.type,
        document_id=n.document_id,
        payload=n.payload,
        is_read=n.is_read,
        created_at=n.created_at,
    )


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ActorUser = aliased(User)
    stmt = (
        select(Notification, ActorUser)
        .join(ActorUser, ActorUser.id == Notification.actor_id, isouter=True)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread:
        stmt = stmt.where(Notification.is_read.is_(False))
    rows = (await db.execute(stmt)).all()

    unread_count = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read.is_(False))
    )

    return NotificationListResponse(
        items=[_to_response(n, a) for n, a in rows],
        unread_count=int(unread_count or 0),
    )


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id)
        .where(Notification.is_read.is_(False))
    )
    return {"unread_count": int(count or 0)}


@router.post("/read", status_code=204)
async def mark_read(
    payload: MarkReadRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stmt = update(Notification).where(Notification.user_id == current_user.id)
    if payload.all:
        pass  # touch everything for this user
    elif payload.ids:
        stmt = stmt.where(Notification.id.in_(payload.ids))
    else:
        # no-op if neither ids nor all provided
        return
    await db.execute(stmt.values(is_read=True))
    await db.commit()
