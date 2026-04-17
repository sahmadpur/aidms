import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel


class CountByStatus(BaseModel):
    ocr_status: str
    count: int


class CountByDocType(BaseModel):
    doc_type: Optional[str]
    count: int


class CountByDepartment(BaseModel):
    department_id: Optional[uuid.UUID]
    name_az: Optional[str]
    name_ru: Optional[str]
    name_en: Optional[str]
    count: int


class UploadsByDay(BaseModel):
    date: date
    count: int


class TopUploader(BaseModel):
    user_id: uuid.UUID
    full_name: str
    count: int


class ReportStatsResponse(BaseModel):
    total_docs: int
    indexed: int
    pending: int
    processing: int
    failed: int
    by_ocr_status: list[CountByStatus]
    by_doc_type: list[CountByDocType]
    by_department: list[CountByDepartment]
    uploads_last_30d: list[UploadsByDay]
    top_uploaders: list[TopUploader]
