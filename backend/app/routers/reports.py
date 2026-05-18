from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
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
from app.services.xlsx_export import Sheet, build_workbook

router = APIRouter()


async def _compute_stats(db: AsyncSession) -> ReportStatsResponse:
    status_rows = (
        await db.execute(
            text("SELECT ocr_status, COUNT(*)::int AS count FROM documents GROUP BY ocr_status")
        )
    ).mappings().all()
    by_ocr_status = [CountByStatus(**dict(r)) for r in status_rows]
    totals = {r["ocr_status"]: r["count"] for r in status_rows}
    total_docs = sum(totals.values())

    type_rows = (
        await db.execute(
            text(
                "SELECT doc_type, COUNT(*)::int AS count FROM documents "
                "GROUP BY doc_type ORDER BY count DESC"
            )
        )
    ).mappings().all()
    by_doc_type = [CountByDocType(**dict(r)) for r in type_rows]

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


@router.get("/stats", response_model=ReportStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_admin),
):
    return await _compute_stats(db)


@router.get("/export.xlsx")
async def export_reports_xlsx(
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    stats = await _compute_stats(db)
    lang = (current_admin.language_preference or "en").lower()

    def dept_name(d: CountByDepartment) -> str:
        if lang == "az":
            return d.name_az or d.name_en or ""
        if lang == "ru":
            return d.name_ru or d.name_en or ""
        return d.name_en or d.name_az or ""

    uploader_email_rows = (
        await db.execute(
            text(
                """
                SELECT u.id::text AS user_id, u.email
                FROM users u
                WHERE u.id = ANY(:ids)
                """
            ),
            {"ids": [str(u.user_id) for u in stats.top_uploaders]},
        )
    ).mappings().all()
    email_by_id = {row["user_id"]: row["email"] for row in uploader_email_rows}

    sheets = [
        Sheet(
            name="Summary",
            headers=["Metric", "Value"],
            rows=[
                ["Total documents", stats.total_docs],
                ["Indexed (completed)", stats.indexed],
                ["Pending", stats.pending],
                ["Processing", stats.processing],
                ["Failed", stats.failed],
                ["Generated at (UTC)", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")],
            ],
        ),
        Sheet(
            name="OCR Status",
            headers=["OCR status", "Count"],
            rows=[[s.ocr_status, s.count] for s in stats.by_ocr_status],
        ),
        Sheet(
            name="Doc Types",
            headers=["Doc type", "Count"],
            rows=[[t.doc_type or "(none)", t.count] for t in stats.by_doc_type],
        ),
        Sheet(
            name="Departments",
            headers=["Department", "Count"],
            rows=[[dept_name(d), d.count] for d in stats.by_department],
        ),
        Sheet(
            name="Uploads (30d)",
            headers=["Date", "Count"],
            rows=[[u.date.isoformat(), u.count] for u in stats.uploads_last_30d],
        ),
        Sheet(
            name="Top Uploaders",
            headers=["Full name", "Email", "Documents"],
            rows=[
                [u.full_name, email_by_id.get(str(u.user_id), ""), u.count]
                for u in stats.top_uploaders
            ],
        ),
    ]

    workbook_bytes = build_workbook(sheets)
    filename = f"reports-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.xlsx"
    return StreamingResponse(
        iter([workbook_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
