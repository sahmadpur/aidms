import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


DOC_TYPES = {"contract", "invoice", "report", "letter", "permit", "other"}


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
    display_id: Optional[str]
    title: str
    ocr_status: str
    file_size_bytes: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentResponse(BaseModel):
    id: uuid.UUID
    display_id: Optional[str]
    user_id: uuid.UUID
    title: str
    category_id: Optional[uuid.UUID]
    folder_id: Optional[uuid.UUID]
    department_id: Optional[uuid.UUID]
    doc_type: Optional[str]
    physical_location: Optional[str]
    tags: list[str]
    language: Optional[str]
    description: Optional[str]
    source: Optional[str]
    original_filename: Optional[str]
    file_size_bytes: int
    ocr_status: str
    ocr_error: Optional[str]
    ocr_retry_count: int
    approval_status: str
    approved_by: Optional[uuid.UUID]
    approved_at: Optional[datetime]
    validation_status: str
    validation_results: Optional[list] = None
    validated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ApprovalActionRequest(BaseModel):
    reason: Optional[str] = None


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    total: int
    page: int
    page_size: int


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    category_id: Optional[uuid.UUID] = None
    folder_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    doc_type: Optional[str] = None
    physical_location: Optional[str] = None
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

    @field_validator("doc_type")
    @classmethod
    def valid_doc_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in DOC_TYPES:
            raise ValueError(f"doc_type must be one of: {', '.join(sorted(DOC_TYPES))}")
        return v
