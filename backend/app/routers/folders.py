import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.folder import Folder
from app.models.user import User
from app.schemas.folder import (
    FolderCreate,
    FolderResponse,
    FolderTreeNode,
    FolderUpdate,
)
from app.services import audit

router = APIRouter()


@router.get("", response_model=list[FolderTreeNode])
async def list_folders(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Return every folder with its ancestor chain (path) and document count."""
    sql = text(
        """
        WITH RECURSIVE tree AS (
            SELECT
                id, parent_id, name_az, name_ru, name_en,
                ARRAY[name_az]::text[] AS path_az,
                ARRAY[name_ru]::text[] AS path_ru,
                ARRAY[name_en]::text[] AS path_en,
                1 AS depth
            FROM folders
            WHERE parent_id IS NULL

            UNION ALL

            SELECT
                f.id, f.parent_id, f.name_az, f.name_ru, f.name_en,
                tree.path_az || f.name_az,
                tree.path_ru || f.name_ru,
                tree.path_en || f.name_en,
                tree.depth + 1
            FROM folders f
            JOIN tree ON f.parent_id = tree.id
        )
        SELECT
            t.id, t.parent_id, t.name_az, t.name_ru, t.name_en,
            t.depth, t.path_az, t.path_ru, t.path_en,
            COALESCE(dc.count, 0) AS document_count
        FROM tree t
        LEFT JOIN (
            SELECT folder_id, COUNT(*) AS count
            FROM documents
            WHERE folder_id IS NOT NULL
            GROUP BY folder_id
        ) dc ON dc.folder_id = t.id
        ORDER BY t.path_en
        """
    )
    rows = (await db.execute(sql)).mappings().all()
    return [FolderTreeNode(**dict(r)) for r in rows]


@router.post("", response_model=FolderResponse, status_code=status.HTTP_201_CREATED)
async def create_folder(
    request: FolderCreate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    if request.parent_id:
        parent = await db.scalar(select(Folder).where(Folder.id == request.parent_id))
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found"
            )

    folder = Folder(
        id=uuid.uuid4(),
        parent_id=request.parent_id,
        name_az=request.name_az,
        name_ru=request.name_ru,
        name_en=request.name_en,
    )
    db.add(folder)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="folder.create",
        entity_type="folder",
        entity_id=folder.id,
        metadata={"name_en": folder.name_en, "parent_id": str(request.parent_id) if request.parent_id else None},
        request=http_request,
    )

    await db.commit()
    await db.refresh(folder)
    return folder


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: uuid.UUID,
    request: FolderUpdate,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    folder = await db.scalar(select(Folder).where(Folder.id == folder_id))
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    data = request.model_dump(exclude_unset=True)

    # Prevent setting parent to self or a descendant (cycle detection)
    if "parent_id" in data and data["parent_id"] is not None:
        new_parent = data["parent_id"]
        if new_parent == folder_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A folder cannot be its own parent",
            )
        # Walk the descendants of this folder and reject if new_parent is among them
        descendant_sql = text(
            """
            WITH RECURSIVE descendants AS (
                SELECT id FROM folders WHERE parent_id = :root
                UNION ALL
                SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
            )
            SELECT 1 FROM descendants WHERE id = :target LIMIT 1
            """
        )
        hit = await db.execute(descendant_sql, {"root": str(folder_id), "target": str(new_parent)})
        if hit.scalar() is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot move a folder under its own descendant",
            )

    for field, value in data.items():
        setattr(folder, field, value)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="folder.update",
        entity_type="folder",
        entity_id=folder.id,
        metadata=data,
        request=http_request,
    )

    await db.commit()
    await db.refresh(folder)
    return folder


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: uuid.UUID,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    folder = await db.scalar(select(Folder).where(Folder.id == folder_id))
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    # Rely on ON DELETE SET NULL: children become roots, documents lose folder_id
    await db.delete(folder)

    await audit.log(
        db,
        user_id=current_admin.id,
        action="folder.delete",
        entity_type="folder",
        entity_id=folder_id,
        metadata={"name_en": folder.name_en},
        request=http_request,
    )
    await db.commit()
