"""
ARQ background worker for OCR + embedding pipeline.

Start with:
    arq app.workers.ocr_worker.WorkerSettings
"""

import uuid

from arq import create_pool
from arq.connections import RedisSettings
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.document import Document

REDIS_SETTINGS = RedisSettings.from_dsn(settings.redis_url)

# Exponential backoff delays in seconds: attempt 1 → 2 min, attempt 2 → 4 min
RETRY_DELAYS = [120, 240]
MAX_RETRIES = 3


async def process_document(ctx: dict, document_id: str) -> None:
    """Main ARQ job: run OCR pipeline for a document."""
    from app.services.ocr import run_ocr_pipeline

    async with AsyncSessionLocal() as db:
        doc = await db.scalar(
            select(Document).where(Document.id == uuid.UUID(document_id))
        )
        if not doc:
            return

        # Guard: skip if already successfully processed
        if doc.ocr_status == "completed":
            return

        # Guard: stop if max retries exceeded
        if doc.ocr_retry_count >= MAX_RETRIES:
            doc.ocr_status = "failed"
            await db.commit()
            return

        doc.ocr_status = "processing"
        await db.commit()

        try:
            await run_ocr_pipeline(db, doc)
            doc.ocr_status = "completed"
            doc.ocr_error = None
            await db.commit()

        except Exception as exc:
            doc.ocr_retry_count += 1
            doc.ocr_error = str(exc)

            if doc.ocr_retry_count >= MAX_RETRIES:
                doc.ocr_status = "failed"
            else:
                doc.ocr_status = "pending"
                # Re-enqueue with exponential backoff
                delay = RETRY_DELAYS[min(doc.ocr_retry_count - 1, len(RETRY_DELAYS) - 1)]
                pool = await create_pool(REDIS_SETTINGS)
                await pool.enqueue_job(
                    "process_document",
                    document_id,
                    _defer_by=delay,
                )
                await pool.aclose()

            await db.commit()


class WorkerSettings:
    functions = [process_document]
    redis_settings = REDIS_SETTINGS
    max_jobs = 5
    job_timeout = 180  # 3 minutes max per job
    keep_result = 3600  # keep job results for 1 hour
