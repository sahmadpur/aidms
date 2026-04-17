from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import (
    PasswordChangeRequest,
    UserSelfResponse,
    UserSelfUpdate,
)
from app.services import audit

router = APIRouter()


@router.get("/me", response_model=UserSelfResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


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
    return current_user


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
