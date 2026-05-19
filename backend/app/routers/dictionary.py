import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select, update as sa_update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.dictionary import DictionaryEntry, DictionaryScope
from app.models.user import User
from app.schemas.dictionary import (
    DictionaryEntryCreate,
    DictionaryEntryListResponse,
    DictionaryEntryResponse,
    DictionaryEntryUpdate,
    DictionaryScopeCreate,
    DictionaryScopeResponse,
    DictionaryScopeUpdate,
)
from app.services import audit

read_router = APIRouter()
admin_router = APIRouter()


def _sort_column(lang: str):
    if lang == "az":
        return DictionaryEntry.term_az
    if lang == "ru":
        return DictionaryEntry.term_ru
    return DictionaryEntry.term_en


def _scope_sort(lang: str):
    if lang == "az":
        return DictionaryScope.name_az
    if lang == "ru":
        return DictionaryScope.name_ru
    return DictionaryScope.name_en


@read_router.get("", response_model=DictionaryEntryListResponse)
async def list_entries(
    scope: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conditions = []
    if scope:
        conditions.append(DictionaryEntry.scope == scope)
    if q:
        like = f"%{q}%"
        conditions.append(
            or_(
                DictionaryEntry.term_az.ilike(like),
                DictionaryEntry.term_ru.ilike(like),
                DictionaryEntry.term_en.ilike(like),
            )
        )

    count_stmt = select(func.count(DictionaryEntry.id))
    for c in conditions:
        count_stmt = count_stmt.where(c)
    total = await db.scalar(count_stmt) or 0

    sort_col = _sort_column(current_user.language_preference or "en")
    stmt = select(DictionaryEntry).order_by(sort_col.asc())
    for c in conditions:
        stmt = stmt.where(c)
    stmt = stmt.offset(offset).limit(limit)

    rows = (await db.scalars(stmt)).all()
    return DictionaryEntryListResponse(
        items=[DictionaryEntryResponse.model_validate(r) for r in rows],
        total=total,
    )


@read_router.get("/scopes", response_model=list[DictionaryScopeResponse])
async def list_scopes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sort_col = _scope_sort(current_user.language_preference or "en")
    rows = (
        await db.scalars(select(DictionaryScope).order_by(sort_col.asc()))
    ).all()
    return [DictionaryScopeResponse.model_validate(r) for r in rows]


@admin_router.post(
    "",
    response_model=DictionaryEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    body: DictionaryEntryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    entry = DictionaryEntry(
        id=uuid.uuid4(),
        scope=body.scope,
        term_az=body.term_az,
        term_ru=body.term_ru,
        term_en=body.term_en,
        definition_az=body.definition_az,
        definition_ru=body.definition_ru,
        definition_en=body.definition_en,
        created_by=current_admin.id,
    )
    db.add(entry)
    await db.flush()
    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.create",
        entity_type="dictionary",
        entity_id=entry.id,
        metadata={"scope": entry.scope, "term_en": entry.term_en},
        request=request,
    )
    await db.commit()
    await db.refresh(entry)
    return DictionaryEntryResponse.model_validate(entry)


@admin_router.patch("/{entry_id}", response_model=DictionaryEntryResponse)
async def update_entry(
    entry_id: uuid.UUID,
    body: DictionaryEntryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    entry = await db.scalar(
        select(DictionaryEntry).where(DictionaryEntry.id == entry_id)
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dictionary entry not found"
        )

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(entry, field, value)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.update",
        entity_type="dictionary",
        entity_id=entry.id,
        metadata={"fields": sorted(updates.keys()), "term_en": entry.term_en},
        request=request,
    )
    await db.commit()
    await db.refresh(entry)
    return DictionaryEntryResponse.model_validate(entry)


@admin_router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(
    entry_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    entry = await db.scalar(
        select(DictionaryEntry).where(DictionaryEntry.id == entry_id)
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dictionary entry not found"
        )
    await db.delete(entry)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.delete",
        entity_type="dictionary",
        entity_id=entry_id,
        metadata={"scope": entry.scope, "term_en": entry.term_en},
        request=request,
    )
    await db.commit()


@admin_router.post(
    "/scopes",
    response_model=DictionaryScopeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scope(
    body: DictionaryScopeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    scope = DictionaryScope(
        id=uuid.uuid4(),
        key=body.key,
        name_az=body.name_az,
        name_ru=body.name_ru,
        name_en=body.name_en,
    )
    db.add(scope)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Scope '{body.key}' already exists",
        )
    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.scope.create",
        entity_type="dictionary_scope",
        entity_id=scope.id,
        metadata={"key": scope.key, "name_en": scope.name_en},
        request=request,
    )
    await db.commit()
    await db.refresh(scope)
    return DictionaryScopeResponse.model_validate(scope)


@admin_router.patch("/scopes/{scope_id}", response_model=DictionaryScopeResponse)
async def update_scope(
    scope_id: uuid.UUID,
    body: DictionaryScopeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update a scope. Renaming `key` cascades to every dictionary entry that
    references the old key in the same transaction so we never orphan entries.
    """
    scope = await db.scalar(
        select(DictionaryScope).where(DictionaryScope.id == scope_id)
    )
    if not scope:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scope not found"
        )

    updates = body.model_dump(exclude_unset=True)
    old_key = scope.key
    new_key = updates.get("key")

    if new_key and new_key != old_key:
        existing = await db.scalar(
            select(DictionaryScope).where(DictionaryScope.key == new_key)
        )
        if existing and existing.id != scope.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Scope '{new_key}' already exists",
            )

    for field, value in updates.items():
        setattr(scope, field, value)

    cascaded = 0
    if new_key and new_key != old_key:
        result = await db.execute(
            sa_update(DictionaryEntry)
            .where(DictionaryEntry.scope == old_key)
            .values(scope=new_key)
        )
        cascaded = result.rowcount or 0

    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.scope.update",
        entity_type="dictionary_scope",
        entity_id=scope.id,
        metadata={
            "fields": sorted(updates.keys()),
            "old_key": old_key,
            "new_key": scope.key,
            "cascaded_entries": cascaded,
        },
        request=request,
    )
    await db.commit()
    await db.refresh(scope)
    return DictionaryScopeResponse.model_validate(scope)


@admin_router.delete("/scopes/{scope_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scope(
    scope_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    scope = await db.scalar(
        select(DictionaryScope).where(DictionaryScope.id == scope_id)
    )
    if not scope:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scope not found"
        )
    await db.delete(scope)
    await audit.log(
        db,
        user_id=current_admin.id,
        action="dictionary.scope.delete",
        entity_type="dictionary_scope",
        entity_id=scope_id,
        metadata={"key": scope.key, "name_en": scope.name_en},
        request=request,
    )
    await db.commit()
