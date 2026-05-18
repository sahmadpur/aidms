from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.schemas.admin_settings import AISettingsResponse, AISettingsUpdate
from app.services import audit
from app.services.system_settings import (
    ALLOWED_CHAT_MODELS,
    get_chat_model_setting,
    set_chat_model,
)

router = APIRouter()


@router.get("/ai", response_model=AISettingsResponse)
async def get_ai_settings(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
) -> AISettingsResponse:
    model, updated_at = await get_chat_model_setting(db)
    return AISettingsResponse(
        chat_model=model,
        allowed_models=list(ALLOWED_CHAT_MODELS),
        updated_at=updated_at,
    )


@router.patch("/ai", response_model=AISettingsResponse)
async def update_ai_settings(
    body: AISettingsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> AISettingsResponse:
    old_model, _ = await get_chat_model_setting(db)
    new_model, updated_at = await set_chat_model(
        db, body.chat_model, current_admin.id
    )

    await audit.log(
        db,
        user_id=current_admin.id,
        action="system_settings.update",
        entity_type="system_setting",
        metadata={"key": "chat_model", "old": old_model, "new": new_model},
        request=request,
    )
    await db.commit()

    return AISettingsResponse(
        chat_model=new_model,
        allowed_models=list(ALLOWED_CHAT_MODELS),
        updated_at=updated_at,
    )
