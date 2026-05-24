"""split email vs in-app notification preferences

Revision ID: 017
Revises: 016
Create Date: 2026-05-24

Adds three email-specific notification preference columns alongside the
existing in-app notification preferences. All default to True so existing
users keep receiving emails until they explicitly opt out.
"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "email_notify_mentions",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_notify_doc_approvals",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "email_notify_ocr_complete",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "email_notify_ocr_complete")
    op.drop_column("users", "email_notify_doc_approvals")
    op.drop_column("users", "email_notify_mentions")
