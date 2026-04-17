import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class UserSelfResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    language_preference: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserSelfUpdate(BaseModel):
    full_name: Optional[str] = None
    language_preference: Optional[str] = None

    @field_validator("language_preference")
    @classmethod
    def valid_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("az", "ru", "en"):
            raise ValueError("Language must be one of: az, ru, en")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
