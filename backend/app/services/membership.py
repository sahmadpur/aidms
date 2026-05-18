"""Helpers for the (user, department) membership table.

Two distinct concerns share `department_members`:
  * Department-side mutations (`routers/departments.py::_replace_managers`)
    rewrite *only manager rows* for a single department.
  * User-side mutations (admin user create/edit) rewrite *all rows* for a
    single user, mixing manager and member assignments.

This module hosts the user-side helper.
"""

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department, department_members
from app.schemas.admin import DepartmentAssignment


@dataclass
class MembershipDiff:
    """What changed for ``user_id`` after a replace_user_departments call.

    Used by admin.py to email only the newly relevant departments — re-saves
    that don't change anything must not generate email.
    """
    newly_member_dept_ids: set[uuid.UUID]
    newly_manager_dept_ids: set[uuid.UUID]


async def replace_user_departments(
    db: AsyncSession,
    user_id: uuid.UUID,
    assignments: list[DepartmentAssignment],
) -> MembershipDiff:
    """Atomically replace all department membership rows for ``user_id``.

    Validates each ``department_id`` exists. Caller commits the transaction.
    Returns the diff against the previous state so callers can fire
    notifications only for new/promoted memberships (not no-op re-saves).
    """
    if assignments:
        ids = [a.department_id for a in assignments]
        found = await db.execute(
            select(Department.id).where(Department.id.in_(ids))
        )
        found_ids = {row[0] for row in found.all()}
        missing = [str(i) for i in ids if i not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown department_ids: {', '.join(missing)}",
            )

    prev_rows = await db.execute(
        select(department_members.c.department_id, department_members.c.is_manager).where(
            department_members.c.user_id == user_id
        )
    )
    prev_state: dict[uuid.UUID, bool] = {dept_id: is_mgr for dept_id, is_mgr in prev_rows.all()}

    await db.execute(
        delete(department_members).where(
            department_members.c.user_id == user_id
        )
    )
    for a in assignments or []:
        await db.execute(
            department_members.insert().values(
                department_id=a.department_id,
                user_id=user_id,
                is_manager=a.is_manager,
            )
        )

    newly_member: set[uuid.UUID] = set()
    newly_manager: set[uuid.UUID] = set()
    for a in assignments or []:
        prev = prev_state.get(a.department_id)
        if a.is_manager:
            # Newly a manager if they weren't already a manager in this dept
            if prev is not True:
                newly_manager.add(a.department_id)
        else:
            # Newly a member only if they weren't in the dept at all before
            if prev is None:
                newly_member.add(a.department_id)
    return MembershipDiff(
        newly_member_dept_ids=newly_member,
        newly_manager_dept_ids=newly_manager,
    )
