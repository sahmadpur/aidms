"""add comment_mention notification type

Revision ID: 006
Revises: 005
Create Date: 2026-04-24
"""

from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


NOTIFICATION_TYPES_V2 = (
    "comment_added",
    "approval_requested",
    "document_approved",
    "document_rejected",
    "revision_requested",
    "document_resubmitted",
    "comment_mention",
)
NOTIFICATION_TYPES_V1 = tuple(t for t in NOTIFICATION_TYPES_V2 if t != "comment_mention")


def _replace_check(types: tuple[str, ...]) -> None:
    op.execute(
        "ALTER TABLE notifications DROP CONSTRAINT IF EXISTS ck_notifications_type"
    )
    types_list = ", ".join(f"'{t}'" for t in types)
    op.execute(
        f"ALTER TABLE notifications ADD CONSTRAINT ck_notifications_type "
        f"CHECK (type IN ({types_list}))"
    )


def upgrade() -> None:
    _replace_check(NOTIFICATION_TYPES_V2)


def downgrade() -> None:
    _replace_check(NOTIFICATION_TYPES_V1)
