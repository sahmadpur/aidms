"""add email verification fields to users

Revision ID: 007
Revises: 006
Create Date: 2026-05-04
"""

import sqlalchemy as sa
from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "users",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("verification_code_hash", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("verification_code_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("verification_attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("verification_last_sent_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Existing accounts predate this feature — grandfather them in so logins keep working.
    op.execute(
        "UPDATE users SET is_verified = true, email_verified_at = NOW() "
        "WHERE is_verified = false"
    )


def downgrade() -> None:
    op.drop_column("users", "verification_last_sent_at")
    op.drop_column("users", "verification_attempts")
    op.drop_column("users", "verification_code_expires_at")
    op.drop_column("users", "verification_code_hash")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "is_verified")
