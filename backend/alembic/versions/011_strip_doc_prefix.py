"""strip DOC- prefix from document display_id

Revision ID: 011
Revises: 010
Create Date: 2026-05-18

The "DOC-" prefix on every display_id is dead weight — it never changes and
adds visual noise to archive references. This migration switches the trigger
to emit just the zero-padded numeric portion (e.g. ``000142``) and rewrites
the prefix off any pre-existing rows. The numeric suffix is preserved
verbatim, so the sequence value remains correct without a setval call.
"""

from alembic import op


revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE OR REPLACE FUNCTION set_document_display_id()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.display_id IS NULL THEN
                NEW.display_id := lpad(nextval('document_display_seq')::text, 6, '0');
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        UPDATE documents
        SET display_id = substring(display_id FROM 5)
        WHERE display_id LIKE 'DOC-%';
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE documents
        SET display_id = 'DOC-' || display_id
        WHERE display_id IS NOT NULL AND display_id !~ '^DOC-';
    """)

    op.execute("""
        CREATE OR REPLACE FUNCTION set_document_display_id()
        RETURNS trigger AS $$
        BEGIN
            IF NEW.display_id IS NULL THEN
                NEW.display_id := 'DOC-' || lpad(nextval('document_display_seq')::text, 6, '0');
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
