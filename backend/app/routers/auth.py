import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

limiter = Limiter(key_func=get_remote_address)

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User
from app.schemas.auth import (
    AcceptInviteRequest,
    ForgotPasswordRequest,
    InviteInfoResponse,
    RegisterRequest,
    RegisterResponse,
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    ResendVerificationRequest,
    ResendVerificationResponse,
)
from app.services import audit
from app.services.email import (
    EmailDeliveryError,
    send_event_email,
    send_verification_email,
)
from app.services.verification import generate_code, hash_code, verify_code

RESET_TTL_MINUTES = 15
RESET_MAX_ATTEMPTS = 5

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _issue_verification(user: User) -> str:
    code = generate_code()
    user.verification_code_hash = hash_code(code)
    user.verification_code_expires_at = _now() + timedelta(minutes=settings.otp_ttl_minutes)
    user.verification_last_sent_at = _now()
    user.verification_attempts = 0
    return code


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(
    body: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing and existing.is_verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    if existing:
        # Unverified re-registration: refresh credentials and issue a new code.
        existing.password_hash = hash_password(body.password)
        existing.full_name = body.full_name
        existing.language_preference = body.language_preference
        user = existing
    else:
        user = User(
            id=uuid.uuid4(),
            email=body.email,
            password_hash=hash_password(body.password),
            full_name=body.full_name,
            language_preference=body.language_preference,
            is_verified=False,
        )
        db.add(user)
        await db.flush()  # FK target for audit
        await audit.log(
            db,
            user_id=user.id,
            action="user.register",
            entity_type="user",
            entity_id=user.id,
            metadata={"email": user.email},
            request=request,
        )

    code = _issue_verification(user)
    await audit.log(
        db,
        user_id=user.id,
        action="user.verification_code_sent",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )

    try:
        await send_verification_email(
            to_email=user.email,
            full_name=user.full_name,
            code=code,
            language=user.language_preference,
        )
    except EmailDeliveryError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send verification email. Please try again shortly.",
        )

    await db.commit()

    return RegisterResponse(
        email=user.email,
        expires_in_minutes=settings.otp_ttl_minutes,
    )


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_email(
    request: Request,
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
):
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="invalid_or_expired_code",
    )

    user = await db.scalar(select(User).where(User.email == body.email))
    if (
        user is None
        or user.is_verified
        or user.verification_code_hash is None
        or user.verification_code_expires_at is None
        or user.verification_code_expires_at < _now()
        or user.verification_attempts >= settings.otp_max_attempts
    ):
        raise invalid

    if not verify_code(body.code, user.verification_code_hash):
        user.verification_attempts += 1
        await db.commit()
        raise invalid

    user.is_verified = True
    user.email_verified_at = _now()
    user.verification_code_hash = None
    user.verification_code_expires_at = None
    user.verification_attempts = 0
    user.verification_last_sent_at = None

    await audit.log(
        db,
        user_id=user.id,
        action="user.email_verified",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/resend-verification", response_model=ResendVerificationResponse)
@limiter.limit("5/minute")
async def resend_verification(
    request: Request,
    response: Response,
    body: ResendVerificationRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.email == body.email))
    # Generic success on miss / already-verified to avoid leaking account existence.
    if user is None or user.is_verified:
        return ResendVerificationResponse(expires_in_minutes=settings.otp_ttl_minutes)

    if user.verification_last_sent_at is not None:
        elapsed = (_now() - user.verification_last_sent_at).total_seconds()
        remaining = settings.otp_resend_cooldown_seconds - int(elapsed)
        if remaining > 0:
            response.headers["Retry-After"] = str(remaining)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting a new code.",
                headers={"Retry-After": str(remaining)},
            )

    code = _issue_verification(user)
    await audit.log(
        db,
        user_id=user.id,
        action="user.verification_code_sent",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )

    try:
        await send_verification_email(
            to_email=user.email,
            full_name=user.full_name,
            code=code,
            language=user.language_preference,
        )
    except EmailDeliveryError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not send verification email. Please try again shortly.",
        )

    await db.commit()
    return ResendVerificationResponse(expires_in_minutes=settings.otp_ttl_minutes)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_active == True))  # noqa: E712
    # Pending-invite users (password_hash IS NULL) match the same generic 401
    # so we don't leak account state.
    if (
        not user
        or user.password_hash is None
        or not verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="email_not_verified",
        )

    await audit.log(
        db,
        user_id=user.id,
        action="user.login",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


# ── Invite acceptance ─────────────────────────────────────────────────────


def _invite_invalid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="invite_invalid_or_expired",
    )


@router.get("/invite/{token}", response_model=InviteInfoResponse)
async def get_invite(token: str, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.invite_token == token))
    if (
        user is None
        or user.invite_token_expires_at is None
        or user.invite_token_expires_at < _now()
        or not user.is_active
    ):
        raise _invite_invalid()
    return InviteInfoResponse(email=user.email, full_name=user.full_name)


@router.post("/accept-invite", response_model=TokenResponse)
@limiter.limit("10/minute")
async def accept_invite(
    request: Request,
    body: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await db.scalar(select(User).where(User.invite_token == body.token))
    if (
        user is None
        or user.invite_token_expires_at is None
        or user.invite_token_expires_at < _now()
        or not user.is_active
    ):
        raise _invite_invalid()

    user.password_hash = hash_password(body.password)
    user.is_verified = True
    user.email_verified_at = _now()
    user.invite_token = None
    user.invite_token_expires_at = None

    await audit.log(
        db,
        user_id=user.id,
        action="user.invite_accepted",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


# ── Forgot / reset password ───────────────────────────────────────────────


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("3/minute")
async def forgot_password(
    request: Request,
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    # Always return 204 — never confirm or deny whether the email exists.
    user = await db.scalar(
        select(User).where(
            User.email == body.email,
            User.is_active.is_(True),
            User.is_verified.is_(True),
        )
    )
    if user is None or user.password_hash is None:
        return

    code = generate_code()
    user.reset_code_hash = hash_code(code)
    user.reset_code_expires_at = _now() + timedelta(minutes=RESET_TTL_MINUTES)
    user.reset_attempts = 0

    await audit.log(
        db,
        user_id=user.id,
        action="user.password_reset_requested",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()

    await send_event_email(
        to_email=user.email,
        full_name=user.full_name,
        language=user.language_preference or "en",
        event="password_reset_code",
        context={"code": code},
    )


@router.post("/reset-password", response_model=TokenResponse)
@limiter.limit("10/minute")
async def reset_password(
    request: Request,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="invalid_or_expired_code",
    )

    user = await db.scalar(select(User).where(User.email == body.email))
    if (
        user is None
        or not user.is_active
        or user.reset_code_hash is None
        or user.reset_code_expires_at is None
        or user.reset_code_expires_at < _now()
        or user.reset_attempts >= RESET_MAX_ATTEMPTS
    ):
        raise invalid

    if not verify_code(body.code, user.reset_code_hash):
        user.reset_attempts += 1
        await db.commit()
        raise invalid

    user.password_hash = hash_password(body.new_password)
    user.reset_code_hash = None
    user.reset_code_expires_at = None
    user.reset_attempts = 0

    await audit.log(
        db,
        user_id=user.id,
        action="user.password_reset",
        entity_type="user",
        entity_id=user.id,
        request=request,
    )
    await db.commit()

    # Security notice — fire-and-forget; never blocks the response.
    await send_event_email(
        to_email=user.email,
        full_name=user.full_name,
        language=user.language_preference or "en",
        event="password_changed",
        context={},
    )

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(request.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
        user_id = uuid.UUID(payload["sub"])
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user = await db.scalar(
        select(User).where(
            User.id == user_id,
            User.is_active == True,  # noqa: E712
            User.is_verified == True,  # noqa: E712
        )
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
