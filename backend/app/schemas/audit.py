import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[uuid.UUID]
    metadata: Optional[dict[str, Any]] = None
    ip_address: Optional[str]
    user_agent: Optional[str]
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogResponse]
    total: int
    limit: int
    offset: int
