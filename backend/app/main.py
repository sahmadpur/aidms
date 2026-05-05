from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.logging import configure_logging
from app.routers import (
    admin,
    admin_validation,
    audit,
    auth,
    chat,
    comments,
    departments,
    documents,
    folders,
    notifications,
    reports,
    search,
    settings as settings_router,
)

configure_logging()

limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.services.storage import ensure_bucket
    ensure_bucket()
    yield


app = FastAPI(
    title="AI DMS API",
    version="1.0.0",
    description="AI-powered multilingual Document Management System",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Browsers hide custom response headers from JS unless explicitly exposed.
    # The chat SSE endpoint returns X-Session-Id so the client can pin the
    # session id after the first message — without this, every turn comes in
    # as session_id=null and the server creates a brand-new session each time.
    expose_headers=["X-Session-Id"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(settings_router.router, prefix="/users", tags=["users"])
app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(comments.router, prefix="/documents", tags=["comments"])
app.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
app.include_router(folders.router, prefix="/folders", tags=["folders"])
app.include_router(search.router, prefix="/search", tags=["search"])
app.include_router(chat.router, prefix="/chat", tags=["chat"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(departments.router, prefix="/admin/departments", tags=["admin"])
app.include_router(
    admin_validation.router,
    prefix="/admin/validation-rules",
    tags=["admin"],
)
app.include_router(reports.router, prefix="/admin/reports", tags=["admin"])
app.include_router(audit.router, prefix="/admin/audit-logs", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}
