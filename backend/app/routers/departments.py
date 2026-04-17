import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.department import Department
from app.models.user import User
from app.schemas.department import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentUpdate,
)
from app.services import audit

router = APIRouter()


@router.get("", response_model=list[DepartmentResponse])
async def list_departments(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.scalars(select(Department).order_by(Department.name_en))).all()
    return rows


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
    await audit.log(
        db,
        user_id=current_admin.id,
        action="department.create",
        entity_type="department",
        entity_id=dept.id,
        metadata={"name_en": dept.name_en},
        request=http_request,
    )
    await db.commit()
    await db.refresh(dept)
    return dept


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
    for field, value in data.items():
        setattr(dept, field, value)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="department.update",
        entity_type="department",
        entity_id=dept.id,
        metadata=data,
        request=http_request,
    )
    await db.commit()
    await db.refresh(dept)
    return dept


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
