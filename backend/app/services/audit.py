import uuid
from typing import Optional, Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog


async def log(
    db: AsyncSession,
    *,
    user_id: Optional[uuid.UUID],
    action: str,
    entity_type: str,
    entity_id: Optional[uuid.UUID] = None,
    metadata: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
) -> None:
    """Append a row to audit_logs. Caller is responsible for db.commit()."""
    ip = None
    ua = None
    if request is not None:
        ip = request.client.host if request.client else None
        ua = request.headers.get("user-agent")
        if ua and len(ua) > 255:
            ua = ua[:255]

    entry = AuditLog(
        id=uuid.uuid4(),
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        extra_data=metadata,
        ip_address=ip,
        user_agent=ua,
    )
    db.add(entry)
