import io
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import hash_password, verify_password
from app.dependencies import get_current_user
from app.models.department import department_members
from app.models.user import User
from app.schemas.user import (
    PasswordChangeRequest,
    UserDirectoryEntry,
    UserSelfResponse,
    UserSelfUpdate,
)
from app.services import audit, storage
from app.services.email import send_event_email

logger = logging.getLogger(__name__)

router = APIRouter()

AVATAR_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
AVATAR_ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
AVATAR_DIMENSION_CAP = (512, 512)


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


async def _managed_department_ids(db: AsyncSession, user_id: uuid.UUID) -> list[uuid.UUID]:
    rows = await db.execute(
        select(department_members.c.department_id).where(
            department_members.c.user_id == user_id,
            department_members.c.is_manager.is_(True),
        )
    )
    return [r[0] for r in rows.all()]


def _self_response(user: User, managed: list[uuid.UUID]) -> UserSelfResponse:
    return UserSelfResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        language_preference=user.language_preference,
        is_active=user.is_active,
        avatar_url=user.avatar_url,
        notify_mentions=user.notify_mentions,
        notify_doc_approvals=user.notify_doc_approvals,
        notify_ocr_complete=user.notify_ocr_complete,
        managed_department_ids=managed,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("/me", response_model=UserSelfResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _self_response(current_user, await _managed_department_ids(db, current_user.id))


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
    return _self_response(current_user, await _managed_department_ids(db, current_user.id))


@router.post("/me/avatar", response_model=UserSelfResponse)
async def upload_avatar(
    http_request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a square avatar. The client should have cropped to 1:1 already;
    we still cap dimensions at 512×512 and re-encode as JPEG to normalize.
    """
    if file.content_type not in AVATAR_ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Avatar must be JPEG, PNG, or WEBP",
        )
    raw = await file.read()
    if len(raw) > AVATAR_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Avatar must be 5 MB or smaller",
        )
    try:
        # First open to verify the bytes parse as an image.
        Image.open(io.BytesIO(raw)).verify()
        # verify() consumes the stream — re-open for actual processing.
        img = Image.open(io.BytesIO(raw))
        img = img.convert("RGB")
        img.thumbnail(AVATAR_DIMENSION_CAP)
    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read image",
        )

    out = io.BytesIO()
    img.save(out, format="JPEG", quality=88, optimize=True)
    out.seek(0)

    new_key = await storage.upload_avatar(out.read(), current_user.id, "image/jpeg")

    old_key = current_user.avatar_url
    current_user.avatar_url = new_key
    await audit.log(
        db,
        user_id=current_user.id,
        action="user.avatar_update",
        entity_type="user",
        entity_id=current_user.id,
        request=http_request,
    )
    await db.commit()
    await db.refresh(current_user)

    if old_key:
        # Best-effort cleanup; never block the save on MinIO eviction failure.
        try:
            await storage.delete_file(old_key)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to delete old avatar %s: %s", old_key, exc)

    return _self_response(current_user, await _managed_department_ids(db, current_user.id))


@router.delete("/me/avatar", response_model=UserSelfResponse)
async def delete_avatar(
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    old_key = current_user.avatar_url
    if old_key is None:
        return _self_response(current_user, await _managed_department_ids(db, current_user.id))

    current_user.avatar_url = None
    await audit.log(
        db,
        user_id=current_user.id,
        action="user.avatar_delete",
        entity_type="user",
        entity_id=current_user.id,
        request=http_request,
    )
    await db.commit()
    await db.refresh(current_user)

    try:
        await storage.delete_file(old_key)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to delete avatar %s: %s", old_key, exc)

    return _self_response(current_user, await _managed_department_ids(db, current_user.id))


@router.get("/{user_id}/avatar")
async def get_user_avatar(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _current: User = Depends(get_current_user),
):
    """Stream a user's avatar. Org-wide visibility — any authenticated user
    can fetch any user's avatar (same posture as document files).
    """
    user = await db.get(User, user_id)
    if user is None or user.avatar_url is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No avatar")

    def iterator():
        stream = storage.get_file_stream(user.avatar_url)
        try:
            for chunk in stream.stream(64 * 1024):
                yield chunk
        finally:
            stream.close()
            stream.release_conn()

    return StreamingResponse(
        iterator(),
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=300"},
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

    await send_event_email(
        to_email=current_user.email,
        full_name=current_user.full_name,
        language=current_user.language_preference or "en",
        event="password_changed",
        context={},
    )
