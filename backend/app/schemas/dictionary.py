import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


_SCOPE_RE = re.compile(r"^[a-z0-9_]+$")


def _validate_scope_key(v: str) -> str:
    v = v.strip().lower()
    if not _SCOPE_RE.match(v):
        raise ValueError("scope must be lowercase letters, digits, or underscores")
    return v


class DictionaryEntryCreate(BaseModel):
    scope: str = Field(default="term", min_length=1, max_length=32)
    term_az: str = Field(min_length=1, max_length=200)
    term_ru: str = Field(min_length=1, max_length=200)
    term_en: str = Field(min_length=1, max_length=200)
    definition_az: str = Field(min_length=1)
    definition_ru: str = Field(min_length=1)
    definition_en: str = Field(min_length=1)

    @field_validator("scope")
    @classmethod
    def _scope(cls, v: str) -> str:
        return _validate_scope_key(v)


class DictionaryEntryUpdate(BaseModel):
    scope: Optional[str] = Field(default=None, min_length=1, max_length=32)
    term_az: Optional[str] = Field(default=None, min_length=1, max_length=200)
    term_ru: Optional[str] = Field(default=None, min_length=1, max_length=200)
    term_en: Optional[str] = Field(default=None, min_length=1, max_length=200)
    definition_az: Optional[str] = Field(default=None, min_length=1)
    definition_ru: Optional[str] = Field(default=None, min_length=1)
    definition_en: Optional[str] = Field(default=None, min_length=1)

    @field_validator("scope")
    @classmethod
    def _scope(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_scope_key(v)


class DictionaryEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scope: str
    term_az: str
    term_ru: str
    term_en: str
    definition_az: str
    definition_ru: str
    definition_en: str
    created_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime


class DictionaryEntryListResponse(BaseModel):
    items: list[DictionaryEntryResponse]
    total: int


class DictionaryScopeCreate(BaseModel):
    key: str = Field(min_length=1, max_length=32)
    name_az: str = Field(min_length=1, max_length=120)
    name_ru: str = Field(min_length=1, max_length=120)
    name_en: str = Field(min_length=1, max_length=120)

    @field_validator("key")
    @classmethod
    def _key(cls, v: str) -> str:
        return _validate_scope_key(v)


class DictionaryScopeUpdate(BaseModel):
    key: Optional[str] = Field(default=None, min_length=1, max_length=32)
    name_az: Optional[str] = Field(default=None, min_length=1, max_length=120)
    name_ru: Optional[str] = Field(default=None, min_length=1, max_length=120)
    name_en: Optional[str] = Field(default=None, min_length=1, max_length=120)

    @field_validator("key")
    @classmethod
    def _key(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_scope_key(v)


class DictionaryScopeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name_az: str
    name_ru: str
    name_en: str
    created_at: datetime
