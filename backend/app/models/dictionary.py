import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DictionaryEntry(Base):
    __tablename__ = "dictionary_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Loose tag matching DictionaryScope.key. Intentionally not a FK so deleting
    # a scope leaves existing entries readable (they just become "uncategorised").
    scope: Mapped[str] = mapped_column(String(32), nullable=False, default="term", server_default="term")
    term_az: Mapped[str] = mapped_column(String(200), nullable=False)
    term_ru: Mapped[str] = mapped_column(String(200), nullable=False)
    term_en: Mapped[str] = mapped_column(String(200), nullable=False)
    definition_az: Mapped[str] = mapped_column(Text, nullable=False)
    definition_ru: Mapped[str] = mapped_column(Text, nullable=False)
    definition_en: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_dictionary_scope", "scope"),
    )


class DictionaryScope(Base):
    __tablename__ = "dictionary_scopes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Stable machine key — used as DictionaryEntry.scope. Unique, lowercase-ish.
    key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name_az: Mapped[str] = mapped_column(String(120), nullable=False)
    name_ru: Mapped[str] = mapped_column(String(120), nullable=False)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
