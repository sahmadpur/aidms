from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.schemas.reports import (
    CountByDepartment,
    CountByDocType,
    CountByStatus,
    ReportStatsResponse,
    TopUploader,
    UploadsByDay,
)

router = APIRouter()


@router.get("/stats", response_model=ReportStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Totals + OCR breakdown
    status_rows = (
        await db.execute(
            text("SELECT ocr_status, COUNT(*)::int AS count FROM documents GROUP BY ocr_status")
        )
    ).mappings().all()
    by_ocr_status = [CountByStatus(**dict(r)) for r in status_rows]
    totals = {r["ocr_status"]: r["count"] for r in status_rows}
    total_docs = sum(totals.values())

    # Doc types (NULL grouped as "other" bucket kept separately)
    type_rows = (
        await db.execute(
            text(
                "SELECT doc_type, COUNT(*)::int AS count FROM documents "
                "GROUP BY doc_type ORDER BY count DESC"
            )
        )
    ).mappings().all()
    by_doc_type = [CountByDocType(**dict(r)) for r in type_rows]

    # Departments (LEFT JOIN so docs without a department show as NULLs)
    dept_rows = (
        await db.execute(
            text(
                """
                SELECT
                    dept.id AS department_id,
                    dept.name_az, dept.name_ru, dept.name_en,
                    COUNT(d.id)::int AS count
                FROM departments dept
                LEFT JOIN documents d ON d.department_id = dept.id
                GROUP BY dept.id, dept.name_az, dept.name_ru, dept.name_en
                ORDER BY count DESC
                """
            )
        )
    ).mappings().all()
    by_department = [CountByDepartment(**dict(r)) for r in dept_rows]

    # Uploads per day (last 30 days)
    upload_rows = (
        await db.execute(
            text(
                """
                SELECT DATE(created_at) AS date, COUNT(*)::int AS count
                FROM documents
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY DATE(created_at)
                ORDER BY date
                """
            )
        )
    ).mappings().all()
    uploads_last_30d = [UploadsByDay(**dict(r)) for r in upload_rows]

    # Top uploaders
    uploader_rows = (
        await db.execute(
            text(
                """
                SELECT u.id AS user_id, u.full_name, COUNT(d.id)::int AS count
                FROM users u
                JOIN documents d ON d.user_id = u.id
                GROUP BY u.id, u.full_name
                ORDER BY count DESC
                LIMIT 10
                """
            )
        )
    ).mappings().all()
    top_uploaders = [TopUploader(**dict(r)) for r in uploader_rows]

    return ReportStatsResponse(
        total_docs=total_docs,
        indexed=totals.get("completed", 0),
        pending=totals.get("pending", 0),
        processing=totals.get("processing", 0),
        failed=totals.get("failed", 0),
        by_ocr_status=by_ocr_status,
        by_doc_type=by_doc_type,
        by_department=by_department,
        uploads_last_30d=uploads_last_30d,
        top_uploaders=top_uploaders,
    )
