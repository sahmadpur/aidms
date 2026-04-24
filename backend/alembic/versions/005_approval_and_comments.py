"""approval workflow + comments + notifications

Revision ID: 005
Revises: 004
Create Date: 2026-04-24
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


APPROVAL_STATUSES = ("pending", "approved", "rejected", "revision_requested")
NOTIFICATION_TYPES = (
    "comment_added",
    "approval_requested",
    "document_approved",
    "document_rejected",
    "revision_requested",
    "document_resubmitted",
)


def upgrade() -> None:
    # documents: approval columns
    op.add_column(
        "documents",
        sa.Column(
            "approval_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "documents",
        sa.Column(
            "approved_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "documents",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    statuses_list = ", ".join(f"'{s}'" for s in APPROVAL_STATUSES)
    op.execute(
        f"ALTER TABLE documents ADD CONSTRAINT ck_documents_approval_status "
        f"CHECK (approval_status IN ({statuses_list}))"
    )
    op.create_index(
        "ix_documents_approval_status", "documents", ["approval_status"]
    )

    # Grandfather: everything already in the archive is approved.
    op.execute(
        "UPDATE documents SET approval_status = 'approved', "
        "approved_at = created_at"
    )

    # department_managers (M:N)
    op.create_table(
        "department_managers",
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_department_managers_user_id", "department_managers", ["user_id"]
    )

    # document_comments
    op.create_table(
        "document_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.execute(
        "CREATE INDEX ix_document_comments_doc_created "
        "ON document_comments (document_id, created_at DESC)"
    )
    op.create_index(
        "ix_document_comments_user_id", "document_comments", ["user_id"]
    )

    # notifications
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    types_list = ", ".join(f"'{t}'" for t in NOTIFICATION_TYPES)
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT ck_notifications_type "
        f"CHECK (type IN ({types_list}))"
    )
    op.execute(
        "CREATE INDEX ix_notifications_user_unread_created "
        "ON notifications (user_id, is_read, created_at DESC)"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notifications_user_unread_created", table_name="notifications"
    )
    op.execute(
        "ALTER TABLE notifications DROP CONSTRAINT IF EXISTS ck_notifications_type"
    )
    op.drop_table("notifications")

    op.drop_index(
        "ix_document_comments_user_id", table_name="document_comments"
    )
    op.drop_index(
        "ix_document_comments_doc_created", table_name="document_comments"
    )
    op.drop_table("document_comments")

    op.drop_index(
        "ix_department_managers_user_id", table_name="department_managers"
    )
    op.drop_table("department_managers")

    op.drop_index("ix_documents_approval_status", table_name="documents")
    op.execute(
        "ALTER TABLE documents DROP CONSTRAINT IF EXISTS ck_documents_approval_status"
    )
    op.drop_column("documents", "approved_at")
    op.drop_column("documents", "approved_by")
    op.drop_column("documents", "approval_status")
