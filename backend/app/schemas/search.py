import uuid
from datetime import date
from typing import Optional

from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str
    category_id: Optional[uuid.UUID] = None
    tags: Optional[list[str]] = None
    language: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    limit: int = 10


class SearchResultItem(BaseModel):
    document_id: uuid.UUID
    document_title: str
    snippet: str
    page_number: int
    relevance_score: float
    ocr_status: str
    category_id: Optional[uuid.UUID]
    language: Optional[str]
    upload_date: str


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    query: str
