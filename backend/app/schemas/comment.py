import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class CommentAuthor(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    avatar_url: str | None = None
    updated_at: datetime | None = None


class CommentResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    parent_id: uuid.UUID | None = None
    body: str
    is_resolved: bool = False
    resolved_by: uuid.UUID | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    author: CommentAuthor


class CommentCreateRequest(BaseModel):
    body: str
    parent_id: Optional[uuid.UUID] = None

    @field_validator("body")
    @classmethod
    def body_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment body cannot be empty")
        if len(v) > 5000:
            raise ValueError("Comment body cannot exceed 5000 characters")
        return v
