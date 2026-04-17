"""Idempotently seed starter departments + folders for Phase 2.

Run from inside the `api` container (source is baked there):

    docker compose exec api python -m scripts.seed_phase2

or against a host DB with DATABASE_URL set in the environment.
"""

import asyncio
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.department import Department
from app.models.folder import Folder


DEPARTMENTS = [
    {"name_az": "Maliyyə",      "name_ru": "Финансы",    "name_en": "Finance"},
    {"name_az": "Hüquq",        "name_ru": "Юридический","name_en": "Legal"},
    {"name_az": "Əməliyyatlar", "name_ru": "Операции",   "name_en": "Operations"},
    {"name_az": "İnsan Resursları", "name_ru": "Отдел кадров", "name_en": "HR"},
    {"name_az": "Digər",        "name_ru": "Прочее",     "name_en": "Other"},
]

# Folder tree — parent path (en) -> child leaf. Roots have no parent.
FOLDER_TREE: list[tuple[list[str], dict]] = [
    ([], {"name_az": "Hüquq",           "name_ru": "Право",       "name_en": "Legal"}),
    (["Legal"], {"name_az": "Müqavilələr", "name_ru": "Контракты", "name_en": "Contracts"}),
    (["Legal", "Contracts"], {"name_az": "2021", "name_ru": "2021", "name_en": "2021"}),
    (["Legal", "Contracts"], {"name_az": "2022", "name_ru": "2022", "name_en": "2022"}),
    (["Legal"], {"name_az": "İcazələr",  "name_ru": "Разрешения",  "name_en": "Permits"}),
    ([], {"name_az": "Maliyyə",         "name_ru": "Финансы",     "name_en": "Finance"}),
    (["Finance"], {"name_az": "Hesabatlar", "name_ru": "Отчёты",  "name_en": "Reports"}),
    (["Finance"], {"name_az": "Fakturalar","name_ru": "Счета",    "name_en": "Invoices"}),
    (["Finance", "Invoices"], {"name_az": "2023", "name_ru": "2023", "name_en": "2023"}),
    (["Finance", "Invoices"], {"name_az": "2024", "name_ru": "2024", "name_en": "2024"}),
    ([], {"name_az": "Korrespondensiya", "name_ru": "Переписка",  "name_en": "Correspondence"}),
    (["Correspondence"], {"name_az": "Dövlət", "name_ru": "Государство", "name_en": "Government"}),
    (["Correspondence", "Government"], {"name_az": "2024", "name_ru": "2024", "name_en": "2024"}),
    ([], {"name_az": "İnsan Resursları", "name_ru": "Кадры",      "name_en": "HR"}),
    (["HR"], {"name_az": "Siyasətlər",   "name_ru": "Политики",   "name_en": "Policies"}),
    ([], {"name_az": "Əməliyyatlar",     "name_ru": "Операции",   "name_en": "Operations"}),
    (["Operations"], {"name_az": "Tenderlər", "name_ru": "Тендеры", "name_en": "Tenders"}),
]


async def upsert_department(db: AsyncSession, spec: dict) -> None:
    existing = await db.scalar(select(Department).where(Department.name_en == spec["name_en"]))
    if existing:
        return
    db.add(Department(id=uuid.uuid4(), **spec))


async def resolve_folder(db: AsyncSession, path_en: list[str]) -> Folder | None:
    """Walk the folder tree and return the folder whose en-path matches."""
    parent: Folder | None = None
    for segment in path_en:
        q = select(Folder).where(Folder.name_en == segment)
        if parent is None:
            q = q.where(Folder.parent_id.is_(None))
        else:
            q = q.where(Folder.parent_id == parent.id)
        parent = await db.scalar(q)
        if parent is None:
            return None
    return parent


async def upsert_folder(db: AsyncSession, parent_path: list[str], spec: dict) -> None:
    parent = await resolve_folder(db, parent_path) if parent_path else None
    # Check if folder with this name_en already exists under the parent
    q = select(Folder).where(Folder.name_en == spec["name_en"])
    if parent is None:
        q = q.where(Folder.parent_id.is_(None))
    else:
        q = q.where(Folder.parent_id == parent.id)
    if await db.scalar(q):
        return
    db.add(Folder(
        id=uuid.uuid4(),
        parent_id=parent.id if parent else None,
        **spec,
    ))


async def run() -> None:
    async with AsyncSessionLocal() as db:
        for d in DEPARTMENTS:
            await upsert_department(db, d)
        await db.commit()

        # Folders must be inserted in tree order; spec list is already sorted that way.
        for parent_path, spec in FOLDER_TREE:
            await upsert_folder(db, parent_path, spec)
            await db.commit()  # commit after each level so children can resolve parents

    print("Seed complete.")


if __name__ == "__main__":
    asyncio.run(run())
