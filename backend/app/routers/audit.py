import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogListResponse, AuditLogResponse

router = APIRouter()


@router.get("", response_model=AuditLogListResponse)
async def list_audit_logs(
    user_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    created_from: Optional[datetime] = Query(None, alias="from"),
    created_to: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    conditions = []
    if user_id is not None:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if created_from:
        conditions.append(AuditLog.created_at >= created_from)
    if created_to:
        conditions.append(AuditLog.created_at <= created_to)

    base = select(AuditLog, User).outerjoin(User, User.id == AuditLog.user_id)
    for c in conditions:
        base = base.where(c)

    total = await db.scalar(
        select(func.count())
        .select_from(
            select(AuditLog.id).where(*conditions).subquery()
            if conditions
            else select(AuditLog.id).subquery()
        )
    )

    rows = (
        await db.execute(
            base.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit)
        )
    ).all()

    items = [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_email=user.email if user else None,
            user_name=user.full_name if user else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            metadata=log.extra_data,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at,
        )
        for log, user in rows
    ]

    return AuditLogListResponse(
        items=items, total=total or 0, limit=limit, offset=offset
    )
