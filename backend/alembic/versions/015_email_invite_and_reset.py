"""invite tokens, reset codes, nullable password_hash

Revision ID: 015
Revises: 014
Create Date: 2026-05-18

Supports two new auth flows:
- Admin-created users receive an invite link (no admin-typed password);
  ``invite_token`` + ``invite_token_expires_at`` track the pending invite,
  and ``password_hash`` becomes nullable for the gap before acceptance.
- Self-service forgot/reset password uses a 6-digit code mirrored on the
  existing email-verification OTP fields.
"""

from alembic import op
import sqlalchemy as sa


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", nullable=True)
    op.add_column(
        "users",
        sa.Column("invite_token", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("invite_token_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_users_invite_token", "users", ["invite_token"])
    op.add_column(
        "users",
        sa.Column("reset_code_hash", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("reset_code_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "reset_attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "reset_attempts")
    op.drop_column("users", "reset_code_expires_at")
    op.drop_column("users", "reset_code_hash")
    op.drop_index("ix_users_invite_token", table_name="users")
    op.drop_column("users", "invite_token_expires_at")
    op.drop_column("users", "invite_token")
    # We don't auto-fill password_hash on rows that have NULL — make sure to do
    # that manually before downgrading, otherwise the NOT NULL constraint will
    # fail. Skipping the alter to NOT NULL here so the downgrade succeeds on
    # databases that have invited-but-not-accepted rows.