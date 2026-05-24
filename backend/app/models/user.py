import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    # Null when the account is admin-invited but not yet accepted — the user
    # will set their password via the invite-accept flow.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # "admin" | "user"
    language_preference: Mapped[str] = mapped_column(String(5), default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verification_code_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    verification_code_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verification_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    verification_last_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    invite_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    invite_token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reset_code_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reset_code_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reset_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    notify_mentions: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    notify_doc_approvals: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    notify_ocr_complete: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    email_notify_mentions: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    email_notify_doc_approvals: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    email_notify_ocr_complete: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
