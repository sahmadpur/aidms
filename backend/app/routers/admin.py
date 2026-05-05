import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import hash_password
from app.dependencies import require_admin
from app.models.department import Department, department_members
from app.models.document import Category
from app.models.user import User
from app.schemas.admin import (
    PasswordResetRequest,
    UserAdminResponse,
    UserCreateRequest,
    UserDepartment,
    UserUpdateRequest,
)
from app.schemas.document import CategoryResponse, CategoryCreate
from app.services import audit
from app.services.membership import replace_user_departments

router = APIRouter()


# ── Users ──────────────────────────────────────────────────────────────────
#
# This module deliberately omits a DELETE /admin/users/{id} route.
# Document.user_id is FK ON DELETE CASCADE, so a hard delete would erase the
# uploader's documents (and chunks, chat sessions, etc). Use PATCH with
# {is_active: false} instead.


async def _hydrate_departments(
    db: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[UserDepartment]]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(
            select(
                department_members.c.user_id,
                department_members.c.is_manager,
                Department,
            )
            .join(Department, Department.id == department_members.c.department_id)
            .where(department_members.c.user_id.in_(user_ids))
            .order_by(Department.name_en)
        )
    ).all()
    out: dict[uuid.UUID, list[UserDepartment]] = {uid: [] for uid in user_ids}
    for user_id, is_manager, dept in rows:
        out[user_id].append(
            UserDepartment(
                id=dept.id,
                name_az=dept.name_az,
                name_ru=dept.name_ru,
                name_en=dept.name_en,
                is_manager=is_manager,
            )
        )
    return out


def _user_to_response(
    user: User, depts: list[UserDepartment]
) -> UserAdminResponse:
    return UserAdminResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        language_preference=user.language_preference,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        departments=depts,
    )


@router.get("/users", response_model=list[UserAdminResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    users = (
        await db.scalars(select(User).order_by(User.created_at.desc()))
    ).all()
    by_user = await _hydrate_departments(db, [u.id for u in users])
    return [_user_to_response(u, by_user.get(u.id, [])) for u in users]


@router.post(
    "/users",
    response_model=UserAdminResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    body: UserCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    now = datetime.now(timezone.utc)
    user = User(
        id=uuid.uuid4(),
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        language_preference=body.language_preference,
        is_active=True,
        is_verified=True,
        email_verified_at=now,
    )
    db.add(user)
    await db.flush()  # FK target for audit + membership rows

    if body.departments:
        await replace_user_departments(db, user.id, body.departments)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="user.admin_create",
        entity_type="user",
        entity_id=user.id,
        metadata={
            "email": user.email,
            "role": user.role,
            "department_count": len(body.departments or []),
        },
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    by_user = await _hydrate_departments(db, [user.id])
    return _user_to_response(user, by_user.get(user.id, []))


@router.patch("/users/{user_id}", response_model=UserAdminResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    data = body.model_dump(exclude_unset=True)
    departments = data.pop("departments", None)

    # Self-protection: an admin can't demote or deactivate themselves.
    if user_id == current_admin.id:
        if data.get("role") is not None and data["role"] != "admin":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannotEditSelf",
            )
        if data.get("is_active") is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="cannotEditSelf",
            )

    if "email" in data and data["email"] != user.email:
        clash = await db.scalar(
            select(User.id).where(
                User.email == data["email"], User.id != user_id
            )
        )
        if clash is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    for field, value in data.items():
        setattr(user, field, value)

    if departments is not None:
        # Re-parse via the schema field so we get DepartmentAssignment objects
        # (model_dump returned plain dicts).
        from app.schemas.admin import DepartmentAssignment

        assignments = [DepartmentAssignment(**d) for d in departments]
        await replace_user_departments(db, user.id, assignments)

    audit_meta: dict = dict(data)
    if departments is not None:
        audit_meta["department_count"] = len(departments)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="user.admin_update",
        entity_type="user",
        entity_id=user.id,
        metadata=audit_meta,
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    by_user = await _hydrate_departments(db, [user.id])
    return _user_to_response(user, by_user.get(user.id, []))


@router.post(
    "/users/{user_id}/password",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def admin_reset_password(
    user_id: uuid.UUID,
    body: PasswordResetRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user.password_hash = hash_password(body.new_password)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="user.admin_password_reset",
        entity_type="user",
        entity_id=user.id,
        # Never include the password (or its hash) in audit metadata.
        metadata={"target_email": user.email},
        request=request,
    )
    await db.commit()


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
