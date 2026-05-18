"""dictionary scopes (admin-managed tag list)

Revision ID: 014
Revises: 013
Create Date: 2026-05-18

Splits the previously-hardcoded scope list out of the frontend and into an
admin-managed table. Seeded with the four defaults so existing dictionary
entries keep their labels.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dictionary_scopes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(32), nullable=False, unique=True),
        sa.Column("name_az", sa.String(120), nullable=False),
        sa.Column("name_ru", sa.String(120), nullable=False),
        sa.Column("name_en", sa.String(120), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    op.execute(
        """
        INSERT INTO dictionary_scopes (id, key, name_az, name_ru, name_en)
        VALUES
            (gen_random_uuid(), 'term',       'Termin',     'Термин',         'Term'),
            (gen_random_uuid(), 'doc_type',   'Sənəd növü', 'Тип документа',  'Doc type'),
            (gen_random_uuid(), 'category',   'Kateqoriya', 'Категория',      'Category'),
            (gen_random_uuid(), 'department', 'Şöbə',       'Отдел',          'Department')
        """
    )


def downgrade() -> None:
    op.drop_table("dictionary_scopes")
