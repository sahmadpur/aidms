import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class CategoryResponse(BaseModel):
    id: uuid.UUID
    name_az: str
    name_ru: str
    name_en: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name_az: str
    name_ru: str
    name_en: str

    @field_validator("name_az", "name_ru", "name_en")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Category name cannot be empty")
        return v.strip()


class DocumentUploadResponse(BaseModel):
    id: uuid.UUID
    title: str
    ocr_status: str
    file_size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    category_id: Optional[uuid.UUID]
    tags: list[str]
    language: Optional[str]
    description: Optional[str]
    source: Optional[str]
    original_filename: Optional[str]
    file_size_bytes: int
    ocr_status: str
    ocr_error: Optional[str]
    ocr_retry_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    tags: Optional[list[str]] = None
    language: Optional[str] = None
    description: Optional[str] = None
    source: Optional[str] = None

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("Maximum 10 tags allowed")
        return [tag[:50] for tag in v]

    @field_validator("language")
    @classmethod
    def valid_language(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("az", "ru", "en"):
            raise ValueError("Language must be one of: az, ru, en")
        return v
