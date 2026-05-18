"""system settings (admin-tunable globals)

Revision ID: 012
Revises: 011
Create Date: 2026-05-18

A generic key/value store for runtime configuration that admins can change
without redeploying. First consumer: ``chat_model`` — which Claude model the
RAG chat service streams from. Seeded with the current production model so
behavior is preserved on upgrade.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    op.execute(
        """
        INSERT INTO system_settings (key, value)
        VALUES ('chat_model', '"claude-sonnet-4-6"'::jsonb)
        """
    )


def downgrade() -> None:
    op.drop_table("system_settings")
