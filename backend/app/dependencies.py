import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import decode_token
from app.models.department import department_members
from app.models.user import User

bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active == True)  # noqa: E712
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user


async def user_manages_department(
    db: AsyncSession,
    user_id: uuid.UUID,
    department_id: uuid.UUID,
) -> bool:
    row = await db.scalar(
        select(department_members.c.user_id).where(
            department_members.c.user_id == user_id,
            department_members.c.department_id == department_id,
            department_members.c.is_manager.is_(True),
        )
    )
    return row is not None


async def managed_department_ids(
    db: AsyncSession, user_id: uuid.UUID
) -> set[uuid.UUID]:
    rows = await db.execute(
        select(department_members.c.department_id).where(
            department_members.c.user_id == user_id,
            department_members.c.is_manager.is_(True),
        )
    )
    return {r[0] for r in rows.all()}


async def require_manager_or_admin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if current_user.role == "admin":
        return current_user
    managed = await managed_department_ids(db, current_user.id)
    if managed:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Manager or administrator access required",
    )
