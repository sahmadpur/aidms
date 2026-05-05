"""add validation_failed notification type

Revision ID: 010
Revises: 009
Create Date: 2026-05-05

Migration 008 introduced the validation feature, which dispatches a
``validation_failed`` notification when a document fails its rules. The
notifications.type CHECK was last updated in 006 and didn't include this
value, so the worker's INSERT raised CheckViolationError and stranded any
freshly-validated doc in ``ocr_status='processing'``. Adding the value here.
"""

from alembic import op

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


NOTIFICATION_TYPES_V3 = (
    "comment_added",
    "approval_requested",
    "document_approved",
    "document_rejected",
    "revision_requested",
    "document_resubmitted",
    "comment_mention",
    "validation_failed",
)
NOTIFICATION_TYPES_V2 = tuple(
    t for t in NOTIFICATION_TYPES_V3 if t != "validation_failed"
)


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
    _replace_check(NOTIFICATION_TYPES_V3)


def downgrade() -> None:
    # Drop any rows that would violate the narrower CHECK before re-adding it.
    op.execute(
        "DELETE FROM notifications WHERE type = 'validation_failed'"
    )
    _replace_check(NOTIFICATION_TYPES_V2)
