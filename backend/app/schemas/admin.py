import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserAdminResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    language_preference: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRoleUpdateRequest(BaseModel):
    role: str
    is_active: Optional[bool] = None

    def validate_role(self) -> "UserRoleUpdateRequest":
        if self.role not in ("admin", "user"):
            raise ValueError("Role must be admin or user")
        return self
