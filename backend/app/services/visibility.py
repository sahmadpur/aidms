"""
Single source of truth for which documents a user can see.

Pending/rejected/revision_requested documents are hidden from the archive.
Exceptions:
  - Admins see everything.
  - Uploaders see their own uploads regardless of status.
  - Department managers see pre-approval documents for departments they manage.

Search (`services/search.py`) and RAG chat (`services/chat.py`) apply a stricter
rule: they surface only `approved` documents so Claude never cites unreviewed
content. Those modules embed the filter directly in their raw SQL.
"""

from sqlalchemy import exists, or_, true

from app.models.department import department_members
from app.models.document import Document
from app.models.user import User


def visible_documents_clause(user: User):
    """SQLAlchemy WHERE clause for documents the user may read.

    Usage:
        stmt = select(Document).where(visible_documents_clause(user))
    """
    if user.role == "admin":
        return true()

    is_manager_of_doc_dept = (
        exists()
        .where(department_members.c.department_id == Document.department_id)
        .where(department_members.c.user_id == user.id)
        .where(department_members.c.is_manager.is_(True))
    )
    return or_(
        Document.approval_status == "approved",
        Document.user_id == user.id,
        is_manager_of_doc_dept,
    )


async def is_manager_of(db, user: User, department_id) -> bool:
    """True iff `user` is a manager of `department_id`."""
    if department_id is None:
        return False
    row = await db.scalar(
        exists()
        .where(department_members.c.department_id == department_id)
        .where(department_members.c.user_id == user.id)
        .where(department_members.c.is_manager.is_(True))
        .select()
    )
    return bool(row)
