import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, ForeignKey, Text, DateTime, func, ARRAY, Integer, BigInteger
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name_az: Mapped[str] = mapped_column(String(255))
    name_ru: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(500))
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    language: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_path: Mapped[str] = mapped_column(String(1000))  # MinIO object key
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    original_filename: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ocr_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending|processing|completed|failed
    ocr_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ocr_method: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "direct" | "vision"
    ocr_retry_count: Mapped[int] = mapped_column(Integer, default=0)
    ocr_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
