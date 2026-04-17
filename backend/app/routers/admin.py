import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.dependencies import require_admin
from app.models.document import Category
from app.models.user import User
from app.schemas.admin import UserAdminResponse, UserRoleUpdateRequest
from app.schemas.document import CategoryResponse, CategoryCreate
from app.services import audit

router = APIRouter()


# ── Users ──────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserAdminResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()
    return users


@router.patch("/users/{user_id}", response_model=UserAdminResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserRoleUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if body.role not in ("admin", "user"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Role must be 'admin' or 'user'",
        )
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active

    await audit.log(
        db,
        user_id=current_admin.id,
        action="user.admin_update",
        entity_type="user",
        entity_id=user.id,
        metadata={"role": body.role, "is_active": body.is_active},
        request=request,
    )
    await db.commit()
    await db.refresh(user)
    return user


# ── Categories ─────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    cats = (await db.scalars(select(Category).order_by(Category.created_at.desc()))).all()
    return cats


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: CategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cat = Category(
        id=uuid.uuid4(),
        name_az=body.name_az,
        name_ru=body.name_ru,
        name_en=body.name_en,
    )
    db.add(cat)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="category.create",
        entity_type="category",
        entity_id=cat.id,
        metadata={"name_en": cat.name_en},
        request=request,
    )
    await db.commit()
    await db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cat = await db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    await db.delete(cat)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="category.delete",
        entity_type="category",
        entity_id=category_id,
        metadata={"name_en": cat.name_en},
        request=request,
    )
    await db.commit()
