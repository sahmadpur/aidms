import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogListResponse, AuditLogResponse
from app.services.xlsx_export import Sheet, build_workbook

router = APIRouter()

EXPORT_ROW_LIMIT = 50_000


def _build_conditions(
    user_id: Optional[uuid.UUID],
    action: Optional[str],
    entity_type: Optional[str],
    created_from: Optional[datetime],
    created_to: Optional[datetime],
) -> list:
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
    return conditions


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
    conditions = _build_conditions(user_id, action, entity_type, created_from, created_to)

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


@router.get("/export.xlsx")
async def export_audit_logs_xlsx(
    user_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    created_from: Optional[datetime] = Query(None, alias="from"),
    created_to: Optional[datetime] = Query(None, alias="to"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    conditions = _build_conditions(user_id, action, entity_type, created_from, created_to)

    count_q = select(func.count(AuditLog.id))
    for c in conditions:
        count_q = count_q.where(c)
    total = await db.scalar(count_q) or 0
    if total > EXPORT_ROW_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Export would include {total} rows (limit {EXPORT_ROW_LIMIT}). "
                "Narrow the filters and try again."
            ),
        )

    stmt = select(AuditLog, User).outerjoin(User, User.id == AuditLog.user_id)
    for c in conditions:
        stmt = stmt.where(c)
    stmt = stmt.order_by(AuditLog.created_at.desc())

    rows = (await db.execute(stmt)).all()

    sheet_rows = []
    for log, user in rows:
        sheet_rows.append([
            log.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
            if log.created_at
            else "",
            user.full_name if user else "",
            user.email if user else "",
            log.action,
            log.entity_type,
            str(log.entity_id) if log.entity_id else "",
            json.dumps(log.extra_data, ensure_ascii=False) if log.extra_data else "",
        ])

    headers = ["When", "User name", "User email", "Action", "Entity type", "Entity ID", "Metadata"]
    workbook_bytes = build_workbook([Sheet(name="Audit log", headers=headers, rows=sheet_rows)])

    filename = f"audit-log-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        iter([workbook_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
