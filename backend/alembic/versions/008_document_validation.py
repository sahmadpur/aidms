"""document validation rules + per-document validation status

Revision ID: 008
Revises: 007
Create Date: 2026-05-04

Note: doc_type values referenced by validation_rules mirror the document.doc_type
CHECK ({contract, invoice, report, letter, permit, other}). Adding a new doc_type
later requires updating both that CHECK and any rules referencing the old set —
not enforced at the SQL level here so future enum additions don't need a parallel
migration on this table.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "validation_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "department_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("departments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("doc_type", sa.String(length=50), nullable=True),
        sa.Column("target", sa.String(length=50), nullable=False),
        sa.Column("operator", sa.String(length=30), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "severity",
            sa.String(length=10),
            nullable=False,
            server_default="error",
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_by_role", sa.String(length=10), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "severity IN ('error','warning')",
            name="ck_validation_rules_severity",
        ),
        sa.CheckConstraint(
            "department_id IS NOT NULL OR doc_type IS NOT NULL OR created_by_role = 'admin'",
            name="ck_validation_rules_scope_required",
        ),
    )
    op.create_index(
        "ix_validation_rules_scope",
        "validation_rules",
        ["department_id", "doc_type"],
        postgresql_where=sa.text("is_active"),
    )

    op.add_column(
        "documents",
        sa.Column(
            "validation_status",
            sa.String(length=20),
            nullable=False,
            server_default="not_evaluated",
        ),
    )
    op.add_column(
        "documents",
        sa.Column(
            "validation_results",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "documents",
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_documents_validation_status",
        "documents",
        ["validation_status"],
        postgresql_where=sa.text("validation_status = 'failed'"),
    )


def downgrade() -> None:
    op.drop_index("ix_documents_validation_status", table_name="documents")
    op.drop_column("documents", "validated_at")
    op.drop_column("documents", "validation_results")
    op.drop_column("documents", "validation_status")
    op.drop_index("ix_validation_rules_scope", table_name="validation_rules")
    op.drop_table("validation_rules")
