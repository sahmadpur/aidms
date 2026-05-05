"""Helpers for the (user, department) membership table.

Two distinct concerns share `department_members`:
  * Department-side mutations (`routers/departments.py::_replace_managers`)
    rewrite *only manager rows* for a single department.
  * User-side mutations (admin user create/edit) rewrite *all rows* for a
    single user, mixing manager and member assignments.

This module hosts the user-side helper.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.department import Department, department_members
from app.schemas.admin import DepartmentAssignment


async def replace_user_departments(
    db: AsyncSession,
    user_id: uuid.UUID,
    assignments: list[DepartmentAssignment],
) -> None:
    """Atomically replace all department membership rows for ``user_id``.

    Validates each ``department_id`` exists. Caller commits the transaction.
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
