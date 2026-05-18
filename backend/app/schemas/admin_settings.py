from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.services.system_settings import ALLOWED_CHAT_MODELS


ChatModelLiteral = Literal["claude-sonnet-4-6", "claude-haiku-4-5"]


class AISettingsResponse(BaseModel):
    chat_model: ChatModelLiteral
    allowed_models: list[str] = list(ALLOWED_CHAT_MODELS)
    updated_at: Optional[datetime] = None


class AISettingsUpdate(BaseModel):
    chat_model: ChatModelLiteral
