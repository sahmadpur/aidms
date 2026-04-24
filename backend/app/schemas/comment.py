import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class CommentAuthor(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str


class CommentResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    body: str
    created_at: datetime
    author: CommentAuthor


class CommentCreateRequest(BaseModel):
    body: str

    @field_validator("body")
    @classmethod
    def body_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Comment body cannot be empty")
        if len(v) > 5000:
            raise ValueError("Comment body cannot exceed 5000 characters")
        return v
