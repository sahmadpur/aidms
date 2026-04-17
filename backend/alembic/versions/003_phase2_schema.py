"""phase 2 schema: folders, departments, document records-management fields

Revision ID: 003
Revises: 002
Create Date: 2026-04-17
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


DOC_TYPES = ("contract", "invoice", "report", "letter", "permit", "other")


def upgrade() -> None:
    # departments
    op.create_table(
        "departments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name_az", sa.String(255), nullable=False),
        sa.Column("name_ru", sa.String(255), nullable=False),
        sa.Column("name_en", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # folders — self-referential adjacency-list tree
    op.create_table(
        "folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "parent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("name_az", sa.String(255), nullable=False),
        sa.Column("name_ru", sa.String(255), nullable=False),
        sa.Column("name_en", sa.String(255), nullable=False),
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
    op.create_index("ix_folders_parent_id", "folders", ["parent_id"])

    # new columns on documents
    op.add_column(
        "documents",
        sa.Column(
            "folder_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("folders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "documents",
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "documents",
        sa.Column("doc_type", sa.String(20), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("physical_location", sa.String(255), nullable=True),
    )
    op.add_column(
        "documents",
        sa.Column("display_id", sa.String(16), nullable=True),
    )
    op.create_index("ix_documents_folder_id", "documents", ["folder_id"])
    op.create_index("ix_documents_department_id", "documents", ["department_id"])

    # doc_type CHECK constraint (matches string-enum convention)
    doc_types_list = ", ".join(f"'{t}'" for t in DOC_TYPES)
    op.execute(
        f"ALTER TABLE documents ADD CONSTRAINT ck_documents_doc_type "
        f"CHECK (doc_type IS NULL OR doc_type IN ({doc_types_list}))"
    )

    # display_id: sequence + trigger that assigns DOC-000001 etc.
    op.execute("CREATE SEQUENCE IF NOT EXISTS document_display_seq START 1")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION set_document_display_id()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.display_id IS NULL THEN
                NEW.display_id := 'DOC-' || lpad(nextval('document_display_seq')::text, 6, '0');
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER documents_display_id_trg
        BEFORE INSERT ON documents
        FOR EACH ROW
        EXECUTE FUNCTION set_document_display_id()
        """
    )

    # Backfill existing rows, preserving created_at order
    op.execute(
        """
        WITH numbered AS (
            SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
            FROM documents
            WHERE display_id IS NULL
        )
        UPDATE documents d
        SET display_id = 'DOC-' || lpad(numbered.rn::text, 6, '0')
        FROM numbered
        WHERE d.id = numbered.id
        """
    )
    # Advance the sequence past any backfilled values
    op.execute(
        """
        SELECT setval(
            'document_display_seq',
            GREATEST(
                (SELECT COALESCE(MAX(
                    CAST(substring(display_id FROM 5) AS bigint)
                ), 0) FROM documents),
                1
            )
        )
        """
    )
    # Unique index on display_id (created after backfill to avoid violation)
    op.create_index(
        "ix_documents_display_id", "documents", ["display_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_documents_display_id", table_name="documents")
    op.execute("DROP TRIGGER IF EXISTS documents_display_id_trg ON documents")
    op.execute("DROP FUNCTION IF EXISTS set_document_display_id()")
    op.execute("DROP SEQUENCE IF EXISTS document_display_seq")
    op.execute("ALTER TABLE documents DROP CONSTRAINT IF EXISTS ck_documents_doc_type")
    op.drop_index("ix_documents_department_id", table_name="documents")
    op.drop_index("ix_documents_folder_id", table_name="documents")
    op.drop_column("documents", "display_id")
    op.drop_column("documents", "physical_location")
    op.drop_column("documents", "doc_type")
    op.drop_column("documents", "department_id")
    op.drop_column("documents", "folder_id")
    op.drop_index("ix_folders_parent_id", table_name="folders")
    op.drop_table("folders")
    op.drop_table("departments")
