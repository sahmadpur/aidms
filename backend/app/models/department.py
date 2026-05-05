import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, DateTime, Table, Column, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


# (department, user) membership rows. is_manager=True means this row also
# grants manager privileges (inbox visibility, notifications, /users/me
# managed_department_ids). is_manager=False is a plain member.
department_members = Table(
    "department_members",
    Base.metadata,
    Column(
        "department_id",
        PgUUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("is_manager", Boolean, nullable=False),
    Column(
        "created_at",
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    ),
)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name_az: Mapped[str] = mapped_column(String(255))
    name_ru: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
