import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.department import Department, department_managers
from app.models.user import User
from app.schemas.department import (
    DepartmentCreate,
    DepartmentManager,
    DepartmentResponse,
    DepartmentUpdate,
)
from app.services import audit

router = APIRouter()


async def _managers_for(
    db: AsyncSession, department_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[DepartmentManager]]:
    if not department_ids:
        return {}
    rows = (
        await db.execute(
            select(department_managers.c.department_id, User)
            .join(User, User.id == department_managers.c.user_id)
            .where(department_managers.c.department_id.in_(department_ids))
            .order_by(User.full_name)
        )
    ).all()
    out: dict[uuid.UUID, list[DepartmentManager]] = {
        did: [] for did in department_ids
    }
    for dept_id, user in rows:
        out[dept_id].append(
            DepartmentManager(
                id=user.id, full_name=user.full_name, email=user.email
            )
        )
    return out


async def _attach_managers(
    db: AsyncSession, dept: Department
) -> DepartmentResponse:
    by_dept = await _managers_for(db, [dept.id])
    return DepartmentResponse(
        id=dept.id,
        name_az=dept.name_az,
        name_ru=dept.name_ru,
        name_en=dept.name_en,
        created_at=dept.created_at,
        managers=by_dept.get(dept.id, []),
    )


async def _replace_managers(
    db: AsyncSession, department_id: uuid.UUID, manager_ids: list[uuid.UUID]
) -> None:
    unique_ids = list({mid for mid in manager_ids})
    if unique_ids:
        found = await db.execute(
            select(User.id).where(User.id.in_(unique_ids))
        )
        found_ids = {row[0] for row in found.all()}
        missing = [mid for mid in unique_ids if mid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown user_ids: {', '.join(str(m) for m in missing)}",
            )
    await db.execute(
        delete(department_managers).where(
            department_managers.c.department_id == department_id
        )
    )
    for mid in unique_ids:
        await db.execute(
            department_managers.insert().values(
                department_id=department_id, user_id=mid
            )
        )


@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    depts = (
        await db.scalars(select(Department).order_by(Department.name_en))
    ).all()
    by_dept = await _managers_for(db, [d.id for d in depts])
    return [
        DepartmentResponse(
            id=d.id,
            name_az=d.name_az,
            name_ru=d.name_ru,
            name_en=d.name_en,
            created_at=d.created_at,
            managers=by_dept.get(d.id, []),
        )
        for d in depts
    ]


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
async def create_department(
    request: DepartmentCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    dept = Department(
        id=uuid.uuid4(),
        name_az=request.name_az,
        name_ru=request.name_ru,
        name_en=request.name_en,
    )
    db.add(dept)
    await db.flush()
    if request.manager_ids is not None:
        await _replace_managers(db, dept.id, request.manager_ids)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="department.create",
        entity_type="department",
        entity_id=dept.id,
        metadata={
            "name_en": dept.name_en,
            "manager_ids": [str(m) for m in (request.manager_ids or [])],
        },
        request=http_request,
    )
    await db.commit()
    await db.refresh(dept)
    return await _attach_managers(db, dept)


@router.patch("/{department_id}", response_model=DepartmentResponse)
async def update_department(
    department_id: uuid.UUID,
    request: DepartmentUpdate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    dept = await db.scalar(select(Department).where(Department.id == department_id))
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    data = request.model_dump(exclude_unset=True)
    manager_ids = data.pop("manager_ids", None)
    for field, value in data.items():
        setattr(dept, field, value)

    if manager_ids is not None:
        await _replace_managers(db, dept.id, manager_ids)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="department.update",
        entity_type="department",
        entity_id=dept.id,
        metadata={
            **data,
            **(
                {"manager_ids": [str(m) for m in manager_ids]}
                if manager_ids is not None
                else {}
            ),
        },
        request=http_request,
    )
    await db.commit()
    await db.refresh(dept)
    return await _attach_managers(db, dept)


@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_department(
    department_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    dept = await db.scalar(select(Department).where(Department.id == department_id))
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

    await db.delete(dept)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="department.delete",
        entity_type="department",
        entity_id=department_id,
        metadata={"name_en": dept.name_en},
        request=http_request,
    )
    await db.commit()
