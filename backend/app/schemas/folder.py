import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class FolderCreate(BaseModel):
    parent_id: Optional[uuid.UUID] = None
    name_az: str
    name_ru: str
    name_en: str

    @field_validator("name_az", "name_ru", "name_en")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Folder name cannot be empty")
        return v.strip()


class FolderUpdate(BaseModel):
    parent_id: Optional[uuid.UUID] = None
    name_az: Optional[str] = None
    name_ru: Optional[str] = None
    name_en: Optional[str] = None


class FolderResponse(BaseModel):
    id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    name_az: str
    name_ru: str
    name_en: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class FolderTreeNode(BaseModel):
    """A folder enriched with its ancestor chain. Frontend picks the locale."""

    id: uuid.UUID
    parent_id: Optional[uuid.UUID]
    name_az: str
    name_ru: str
    name_en: str
    depth: int
    path_az: list[str]
    path_ru: list[str]
    path_en: list[str]
    document_count: int = 0
