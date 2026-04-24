from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.dependencies import get_current_user
from app.models.department import department_managers
from app.models.user import User
from app.schemas.user import (
    PasswordChangeRequest,
    UserDirectoryEntry,
    UserSelfResponse,
    UserSelfUpdate,
)
from app.services import audit

router = APIRouter()


@router.get("/directory", response_model=list[UserDirectoryEntry])
async def users_directory(
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
    _current: User = Depends(get_current_user),
):
    """Lite directory of active users — used for @-mention autocomplete.

    Any authenticated user can read it; returns only non-sensitive fields.
    """
    stmt = select(User).where(User.is_active.is_(True))
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            User.full_name.ilike(pattern) | User.email.ilike(pattern)
        )
    stmt = stmt.order_by(User.full_name).limit(20)
    rows = (await db.scalars(stmt)).all()
    return [
        UserDirectoryEntry(id=u.id, full_name=u.full_name, email=u.email)
        for u in rows
    ]


@router.get("/me", response_model=UserSelfResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = await db.execute(
        select(department_managers.c.department_id).where(
            department_managers.c.user_id == current_user.id
        )
    )
    managed = [r[0] for r in rows.all()]
    return UserSelfResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        language_preference=current_user.language_preference,
        is_active=current_user.is_active,
        managed_department_ids=managed,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


@router.patch("/me", response_model=UserSelfResponse)
async def update_me(
    request: UserSelfUpdate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = request.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(current_user, field, value)

    await audit.log(
        db,
        user_id=current_user.id,
        action="user.self_update",
        entity_type="user",
        entity_id=current_user.id,
        metadata=data,
        request=http_request,
    )
    await db.commit()
    await db.refresh(current_user)
    rows = await db.execute(
        select(department_managers.c.department_id).where(
            department_managers.c.user_id == current_user.id
        )
    )
    managed = [r[0] for r in rows.all()]
    return UserSelfResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        language_preference=current_user.language_preference,
        is_active=current_user.is_active,
        managed_department_ids=managed,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: PasswordChangeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    current_user.password_hash = hash_password(request.new_password)
    await audit.log(
        db,
        user_id=current_user.id,
        action="user.password_change",
        entity_type="user",
        entity_id=current_user.id,
        request=http_request,
    )
    await db.commit()
