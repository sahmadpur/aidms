"""
Admin-tunable global settings.

Backed by the ``system_settings`` key/value table. Currently exposes the chat
model selection; future settings (temperature, max-tokens, etc.) can land here
without new migrations.

All lookups validate against an in-code allowlist — if the DB row is missing or
holds a value outside the allowlist, callers receive the safe default. This
guarantees the chat service never passes an arbitrary string to the Anthropic
API even if the table is hand-edited.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system_setting import SystemSetting


ALLOWED_CHAT_MODELS: tuple[str, ...] = (
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
)
DEFAULT_CHAT_MODEL = "claude-sonnet-4-6"

_CHAT_MODEL_KEY = "chat_model"


async def get_chat_model(db: AsyncSession) -> str:
    row = await db.scalar(
        select(SystemSetting).where(SystemSetting.key == _CHAT_MODEL_KEY)
    )
    value = row.value if row else None
    if isinstance(value, str) and value in ALLOWED_CHAT_MODELS:
        return value
    return DEFAULT_CHAT_MODEL


async def get_chat_model_setting(
    db: AsyncSession,
) -> tuple[str, Optional[datetime]]:
    """Return (current_model, updated_at) — used by the admin GET endpoint."""
    row = await db.scalar(
        select(SystemSetting).where(SystemSetting.key == _CHAT_MODEL_KEY)
    )
    if row and isinstance(row.value, str) and row.value in ALLOWED_CHAT_MODELS:
        return row.value, row.updated_at
    return DEFAULT_CHAT_MODEL, None


async def set_chat_model(
    db: AsyncSession, model: str, user_id: uuid.UUID
) -> tuple[str, datetime]:
    if model not in ALLOWED_CHAT_MODELS:
        raise ValueError("unsupported_model")

    row = await db.scalar(
        select(SystemSetting).where(SystemSetting.key == _CHAT_MODEL_KEY)
    )
    now = datetime.now(timezone.utc)
    if row is None:
        row = SystemSetting(
            key=_CHAT_MODEL_KEY,
            value=model,
            updated_by=user_id,
        )
        db.add(row)
    else:
        row.value = model
        row.updated_by = user_id
        row.updated_at = now
    return model, now
