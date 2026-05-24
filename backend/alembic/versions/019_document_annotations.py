"""document annotations

Revision ID: 019
Revises: 018
Create Date: 2026-05-24

Adds the document_annotations table for inline PDF annotations linked 1:1
with comments. Each annotation stores page number and highlight rectangles.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "document_annotations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "document_id",
            sa.Uuid(),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "comment_id",
            sa.Uuid(),
            sa.ForeignKey("document_comments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("highlight_rects", JSONB(), nullable=False),
        sa.Column("selected_text", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=False, server_default="default"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_document_annotations_document_id",
        "document_annotations",
        ["document_id"],
    )
    op.create_index(
        "ix_document_annotations_comment_id",
        "document_annotations",
        ["comment_id"],
    )


def downgrade() -> None:
    op.drop_table("document_annotations")
