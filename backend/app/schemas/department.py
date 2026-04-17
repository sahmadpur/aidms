import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class DepartmentCreate(BaseModel):
    name_az: str
    name_ru: str
    name_en: str

    @field_validator("name_az", "name_ru", "name_en")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Department name cannot be empty")
        return v.strip()


class DepartmentUpdate(BaseModel):
    name_az: Optional[str] = None
    name_ru: Optional[str] = None
    name_en: Optional[str] = None


class DepartmentResponse(BaseModel):
    id: uuid.UUID
    name_az: str
    name_ru: str
    name_en: str
    created_at: datetime

    model_config = {"from_attributes": True}
