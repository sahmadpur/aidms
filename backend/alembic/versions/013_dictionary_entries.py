"""dictionary entries (multilingual glossary)

Revision ID: 013
Revises: 012
Create Date: 2026-05-18

Adds the ``dictionary_entries`` table — an admin-curated glossary that pairs a
term (az/ru/en) with its definition (az/ru/en). The optional ``scope`` column
is a free-form tag so admins can group entries by what they describe
(doc_type, category, department, or a generic term).
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dictionary_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "scope",
            sa.String(32),
            nullable=False,
            server_default="term",
        ),
        sa.Column("term_az", sa.String(200), nullable=False),
        sa.Column("term_ru", sa.String(200), nullable=False),
        sa.Column("term_en", sa.String(200), nullable=False),
        sa.Column("definition_az", sa.Text, nullable=False),
        sa.Column("definition_ru", sa.Text, nullable=False),
        sa.Column("definition_en", sa.Text, nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_dictionary_scope", "dictionary_entries", ["scope"]
    )


def downgrade() -> None:
    op.drop_index("ix_dictionary_scope", table_name="dictionary_entries")
    op.drop_table("dictionary_entries")
