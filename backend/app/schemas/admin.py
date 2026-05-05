import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from app.schemas._validators import (
    validate_language,
    validate_password_strength,
    validate_role,
)


class DepartmentAssignment(BaseModel):
    department_id: uuid.UUID
    is_manager: bool = False


class UserDepartment(BaseModel):
    id: uuid.UUID
    name_az: str
    name_ru: str
    name_en: str
    is_manager: bool

    model_config = {"from_attributes": True}


class UserAdminResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    language_preference: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    departments: list[UserDepartment] = []

    model_config = {"from_attributes": True}


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: str = "user"
    language_preference: str = "en"
    departments: Optional[list[DepartmentAssignment]] = None

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)

    @field_validator("language_preference")
    @classmethod
    def _language(cls, v: str) -> str:
        return validate_language(v)

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        return validate_role(v)

    @model_validator(mode="after")
    def _no_dupe_departments(self) -> "UserCreateRequest":
        _ensure_unique_departments(self.departments)
        return self


class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    language_preference: Optional[str] = None
    is_active: Optional[bool] = None
    departments: Optional[list[DepartmentAssignment]] = None

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("language_preference")
    @classmethod
    def _language(cls, v: Optional[str]) -> Optional[str]:
        return v if v is None else validate_language(v)

    @field_validator("role")
    @classmethod
    def _role(cls, v: Optional[str]) -> Optional[str]:
        return v if v is None else validate_role(v)

    @model_validator(mode="after")
    def _no_dupe_departments(self) -> "UserUpdateRequest":
        _ensure_unique_departments(self.departments)
        return self


class PasswordResetRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _password(cls, v: str) -> str:
        return validate_password_strength(v)


# Kept for backwards compatibility — UserUpdateRequest is a strict superset
# (role + is_active both optional), so existing callers that PATCH with
# {role, is_active} continue to validate cleanly. New code should use
# UserUpdateRequest directly.
class UserRoleUpdateRequest(BaseModel):
    role: str
    is_active: Optional[bool] = None

    @field_validator("role")
    @classmethod
    def _role(cls, v: str) -> str:
        return validate_role(v)


def _ensure_unique_departments(
    assignments: Optional[list[DepartmentAssignment]],
) -> None:
    if not assignments:
        return
    seen: set[uuid.UUID] = set()
    for a in assignments:
        if a.department_id in seen:
            raise ValueError(
                f"Duplicate department in payload: {a.department_id}"
            )
        seen.add(a.department_id)
