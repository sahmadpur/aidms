import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import get_db
from app.core.security import hash_password
from app.dependencies import require_admin
from app.models.department import Department, department_members
from app.models.document import Category, Document
from app.models.user import User
from app.schemas.admin import (
    PasswordResetRequest,
    UserAdminResponse,
    UserCreateRequest,
    UserDepartment,
    UserUpdateRequest,
)
from app.schemas.document import CategoryCreate, CategoryResponse, CategoryUpdate
from app.services import audit
from app.services.email import send_event_email
from app.services.membership import MembershipDiff, replace_user_departments

INVITE_TTL_DAYS = 7


def _dept_name_for(dept: Department, language: str) -> str:
    if language == "az":
        return dept.name_az or dept.name_en
    if language == "ru":
        return dept.name_ru or dept.name_en
    return dept.name_en or dept.name_az


async def _email_membership_changes(
    db: AsyncSession,
    *,
    recipient: User,
    diff: MembershipDiff,
    actor: User,
) -> None:
    """Send one email per newly-assigned department (member or manager)."""
    if recipient.id == actor.id:
        # Admin editing their own departments — don't email self.
        return
    if not recipient.is_active:
        return
    dept_ids = diff.newly_member_dept_ids | diff.newly_manager_dept_ids
    if not dept_ids:
        return
    depts = list(
        await db.scalars(select(Department).where(Department.id.in_(dept_ids)))
    )
    by_id = {d.id: d for d in depts}
    lang = recipient.language_preference or "en"
    for dept_id in diff.newly_manager_dept_ids:
        dept = by_id.get(dept_id)
        if dept is None:
            continue
        await send_event_email(
            to_email=recipient.email,
            full_name=recipient.full_name,
            language=lang,
            event="manager_assigned",
            context={
                "actor_name": actor.full_name,
                "dept_name": _dept_name_for(dept, lang),
            },
        )
    for dept_id in diff.newly_member_dept_ids:
        dept = by_id.get(dept_id)
        if dept is None:
            continue
        await send_event_email(
            to_email=recipient.email,
            full_name=recipient.full_name,
            language=lang,
            event="member_assigned",
            context={
                "actor_name": actor.full_name,
                "dept_name": _dept_name_for(dept, lang),
            },
        )

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
    invite_token = secrets.token_urlsafe(32)
    user = User(
        id=uuid.uuid4(),
        email=body.email,
        password_hash=None,
        full_name=body.full_name,
        role=body.role,
        language_preference=body.language_preference,
        is_active=True,
        is_verified=False,
        invite_token=invite_token,
        invite_token_expires_at=now + timedelta(days=INVITE_TTL_DAYS),
    )
    db.add(user)
    await db.flush()  # FK target for audit + membership rows

    membership_diff: MembershipDiff | None = None
    if body.departments:
        membership_diff = await replace_user_departments(
            db, user.id, body.departments
        )

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
            "invited": True,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(user)

    # Fire the invite email outside the transaction. Errors are logged inside
    # send_event_email; the admin still gets a successful response so they can
    # retry by re-sending an invite or resetting the user password manually.
    await send_event_email(
        to_email=user.email,
        full_name=user.full_name,
        language=user.language_preference or "en",
        event="invite",
        context={
            "actor_name": current_admin.full_name,
            "invite_url": f"{settings.frontend_base_url}/accept-invite?token={invite_token}",
        },
    )
    # Newly-created user gets membership emails too — useful when departments
    # are assigned at creation time (their inbox state already has the invite
    # next to the dept notices).
    if membership_diff is not None:
        await _email_membership_changes(
            db, recipient=user, diff=membership_diff, actor=current_admin
        )

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

    # Capture before-state so we can email only on meaningful changes.
    before_role = user.role
    before_active = user.is_active

    for field, value in data.items():
        setattr(user, field, value)

    membership_diff: MembershipDiff | None = None
    if departments is not None:
        # Re-parse via the schema field so we get DepartmentAssignment objects
        # (model_dump returned plain dicts).
        from app.schemas.admin import DepartmentAssignment

        assignments = [DepartmentAssignment(**d) for d in departments]
        membership_diff = await replace_user_departments(db, user.id, assignments)

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

    role_changed = "role" in data and user.role != before_role
    active_changed = "is_active" in data and user.is_active != before_active

    if role_changed:
        await send_event_email(
            to_email=user.email,
            full_name=user.full_name,
            language=user.language_preference or "en",
            event="role_changed",
            context={
                "actor_name": current_admin.full_name,
                "old_role": before_role,
                "new_role": user.role,
            },
        )
    if active_changed:
        status_word = {
            "en": "activated" if user.is_active else "deactivated",
            "az": "aktivləşdirdi" if user.is_active else "deaktivləşdirdi",
            "ru": "активировал(а)" if user.is_active else "деактивировал(а)",
        }
        lang = (user.language_preference or "en").lower()
        await send_event_email(
            to_email=user.email,
            full_name=user.full_name,
            language=lang,
            event="activation_changed",
            context={
                "actor_name": current_admin.full_name,
                "status": status_word.get(lang, status_word["en"]),
            },
        )

    if membership_diff is not None:
        await _email_membership_changes(
            db, recipient=user, diff=membership_diff, actor=current_admin
        )

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
    stmt = (
        select(Category, func.count(Document.id).label("usage_count"))
        .outerjoin(Document, Document.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.created_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        CategoryResponse(
            id=cat.id,
            name_az=cat.name_az,
            name_ru=cat.name_ru,
            name_en=cat.name_en,
            usage_count=usage,
            created_at=cat.created_at,
        )
        for cat, usage in rows
    ]


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
    return CategoryResponse(
        id=cat.id,
        name_az=cat.name_az,
        name_ru=cat.name_ru,
        name_en=cat.name_en,
        usage_count=0,
        created_at=cat.created_at,
    )


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: uuid.UUID,
    body: CategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cat = await db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(cat, field, value)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="category.update",
        entity_type="category",
        entity_id=cat.id,
        metadata=data,
        request=request,
    )
    await db.commit()
    await db.refresh(cat)
    usage = await db.scalar(
        select(func.count(Document.id)).where(Document.category_id == cat.id)
    )
    return CategoryResponse(
        id=cat.id,
        name_az=cat.name_az,
        name_ru=cat.name_ru,
        name_en=cat.name_en,
        usage_count=usage or 0,
        created_at=cat.created_at,
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    request: Request,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    cat = await db.scalar(select(Category).where(Category.id == category_id))
    if not cat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    usage = (
        await db.scalar(
            select(func.count(Document.id)).where(Document.category_id == cat.id)
        )
    ) or 0
    if usage > 0 and not force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "category_in_use",
                "usage_count": usage,
                "message": (
                    f"Category is used by {usage} documents. "
                    "Pass ?force=true to delete anyway."
                ),
            },
        )
    await db.delete(cat)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="category.delete",
        entity_type="category",
        entity_id=category_id,
        metadata={"name_en": cat.name_en, "usage_count": usage},
        request=request,
    )
    await db.commit()
