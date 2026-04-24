import uuid
from datetime import datetime
from typing import Optional, Any

from pydantic import BaseModel


class NotificationActor(BaseModel):
    id: uuid.UUID
    full_name: str


class NotificationResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    actor: Optional[NotificationActor]
    type: str
    document_id: Optional[uuid.UUID]
    payload: Optional[dict[str, Any]]
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


class MarkReadRequest(BaseModel):
    ids: Optional[list[uuid.UUID]] = None
    all: bool = False
