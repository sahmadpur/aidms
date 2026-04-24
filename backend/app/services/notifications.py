import uuid
from typing import Optional, Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import department_managers
from app.models.notification import Notification


async def notify(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    type_: str,
    document_id: Optional[uuid.UUID] = None,
    actor_id: Optional[uuid.UUID] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Insert one notification row. Caller commits."""
    if actor_id is not None and actor_id == user_id:
        # don't notify someone about their own action
        return
    db.add(
        Notification(
            id=uuid.uuid4(),
            user_id=user_id,
            actor_id=actor_id,
            type=type_,
            document_id=document_id,
            payload=payload,
        )
    )


async def notify_many(
    db: AsyncSession,
    *,
    user_ids: Iterable[uuid.UUID],
    type_: str,
    document_id: Optional[uuid.UUID] = None,
    actor_id: Optional[uuid.UUID] = None,
    payload: Optional[dict[str, Any]] = None,
) -> None:
    seen: set[uuid.UUID] = set()
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        await notify(
            db,
            user_id=uid,
            type_=type_,
            document_id=document_id,
            actor_id=actor_id,
            payload=payload,
        )


async def managers_of(
    db: AsyncSession, department_id: Optional[uuid.UUID]
) -> list[uuid.UUID]:
    if department_id is None:
        return []
    rows = await db.execute(
        select(department_managers.c.user_id).where(
            department_managers.c.department_id == department_id
        )
    )
    return [r[0] for r in rows.all()]
