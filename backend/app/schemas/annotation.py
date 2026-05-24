import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HighlightRect(BaseModel):
    x: float
    y: float
    width: float
    height: float
    pageWidth: float
    pageHeight: float


class AnnotationCreate(BaseModel):
    page_number: int
    highlight_rects: list[HighlightRect]
    selected_text: Optional[str] = None
    color: str = "default"
    comment_body: str


class AnnotationResponse(BaseModel):
    id: uuid.UUID
    document_id: uuid.UUID
    comment_id: uuid.UUID
    page_number: int
    highlight_rects: list[HighlightRect]
    selected_text: Optional[str] = None
    color: str
    created_at: datetime
