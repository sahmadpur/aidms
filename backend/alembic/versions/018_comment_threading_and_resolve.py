"""comment threading and resolve

Revision ID: 018
Revises: 017
Create Date: 2026-05-24

Adds threading (parent_id) and resolve (is_resolved, resolved_by, resolved_at)
columns to document_comments for threaded replies and comment resolution.
"""

from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "document_comments",
        sa.Column(
            "parent_id",
            sa.Uuid(),
            sa.ForeignKey("document_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_document_comments_parent_id",
        "document_comments",
        ["parent_id"],
    )
    op.add_column(
        "document_comments",
        sa.Column(
            "is_resolved",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "document_comments",
        sa.Column(
            "resolved_by",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "document_comments",
        sa.Column(
            "resolved_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("document_comments", "resolved_at")
    op.drop_column("document_comments", "resolved_by")
    op.drop_column("document_comments", "is_resolved")
    op.drop_index("ix_document_comments_parent_id", table_name="document_comments")
    op.drop_column("document_comments", "parent_id")
