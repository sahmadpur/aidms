import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ValidationRule(Base):
    __tablename__ = "validation_rules"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"), nullable=True
    )
    doc_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target: Mapped[str] = mapped_column(String(50))
    operator: Mapped[str] = mapped_column(String(30))
    value: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    severity: Mapped[str] = mapped_column(String(10), default="error")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    created_by_role: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
