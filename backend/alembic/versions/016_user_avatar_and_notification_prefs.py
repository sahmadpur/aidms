"""user avatar and notification preferences

Revision ID: 016
Revises: 015
Create Date: 2026-05-19

Adds:
- ``avatar_url`` — MinIO object key for the user's uploaded avatar
  (nullable; initials fall back as today when null).
- Three notification opt-in booleans, all defaulting to True so existing
  users keep getting notified after the migration:
  ``notify_mentions`` — @-mention notifications in comments
  ``notify_doc_approvals`` — approval / rejection / revision-request events
  ``notify_ocr_complete`` — OCR finished on a doc the user uploaded
"""

from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(length=512), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_mentions",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_doc_approvals",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "notify_ocr_complete",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notify_ocr_complete")
    op.drop_column("users", "notify_doc_approvals")
    op.drop_column("users", "notify_mentions")
    op.drop_column("users", "avatar_url")
