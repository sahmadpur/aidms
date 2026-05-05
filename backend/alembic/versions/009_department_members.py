"""rename department_managers → department_members; add is_manager column

Revision ID: 009
Revises: 008
Create Date: 2026-05-05

The association table previously stored *only* manager relationships. We now
also store regular memberships, distinguished by ``is_manager``. Existing rows
default to ``is_manager = TRUE`` so all current behaviour (manager-scoped
visibility, notifications, /users/me managed_department_ids) is preserved
byte-for-byte after the upgrade.

Downgrade discards is_manager=false rows by collapsing them back into the
manager set — that's lossy but unavoidable since the old table can't represent
membership without the manager flag.
"""

import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER INDEX ix_department_managers_user_id "
        "RENAME TO ix_department_members_user_id"
    )
    op.rename_table("department_managers", "department_members")

    # server_default ensures existing rows backfill to TRUE before we tighten
    # the column.
    op.add_column(
        "department_members",
        sa.Column(
            "is_manager",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("department_members", "is_manager", server_default=None)

    op.create_index(
        "ix_department_members_user_manager",
        "department_members",
        ["user_id", "department_id"],
        postgresql_where=sa.text("is_manager"),
    )


def downgrade() -> None:
    # Lossy: rows with is_manager=false silently collapse into the manager set.
    op.drop_index(
        "ix_department_members_user_manager", table_name="department_members"
    )
    op.drop_column("department_members", "is_manager")
    op.rename_table("department_members", "department_managers")
    op.execute(
        "ALTER INDEX ix_department_members_user_id "
        "RENAME TO ix_department_managers_user_id"
    )
