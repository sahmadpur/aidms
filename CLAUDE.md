# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**DocArchive AI** — a multilingual (az/ru/en) Document Management System for an organization-wide archive. Users upload PDFs, the system runs OCR, chunks and embeds the text, and exposes semantic search, RAG chat, folders, a physical-shelf tracker, audit logging, and admin reports.

`docs/REQUIREMENTS.md` is the authoritative spec. The canonical runtime is Docker Compose; see **Development Setup** below.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind, next-intl (cookie-based locale) |
| Backend API | FastAPI (Python) |
| Database | PostgreSQL + pgvector |
| Object Storage | MinIO (S3-compatible) |
| OCR | Google Cloud Vision API |
| Embeddings | OpenAI Embeddings API |
| AI Chat | Anthropic Claude API (streaming) |

---

## Project Structure

```
frontend/          # Next.js 14 App Router, Tailwind brand palette (#2d5016)
  components/      # Sidebar, DataTable, FilterBar, Badge, FolderPicker,
                   # UploadModal, StatCard, TopBar, ChatWindow, …
  lib/             # api.ts (axios + auto-refresh), useMe, useChat, types
backend/
  app/
    routers/       # auth, settings (users/me), documents, folders, search,
                   # chat, admin, departments, reports, audit
    models/        # SQLAlchemy ORM: User, Document, Category, Folder,
                   # Department, DocumentChunk, ChatSession/Message, AuditLog
    schemas/       # Pydantic I/O schemas per resource
    services/      # ocr, embeddings, storage (MinIO), search, chat, audit
    workers/       # ARQ workers (OCR + embedding jobs)
  alembic/         # DB migrations (applied automatically by `migrate` service)
  scripts/         # seed_phase2.py — starter departments + folder tree
docker-compose.yml # postgres+pgvector, redis, minio, migrate, api, worker, frontend
artifact.html      # Phase 2 UI design reference for the Documents list
```

---

## Architecture & Core Workflows

### Visibility model — organization-wide
Every authenticated user sees every document. `Document.user_id` is the uploader (audit only), **not** an access filter. Only the uploader or an admin can PATCH/DELETE/reprocess; reads (list, detail, file, ocr-text) are open to any authenticated user. Admin-only routes use `require_admin` from `app/dependencies.py`.

### Document Ingestion Pipeline
1. PDF uploaded via `POST /documents/upload` (multipart with optional `folder_id`, `department_id`, `doc_type`, `physical_location` form fields) → stored in MinIO, metadata row in PostgreSQL, ARQ job enqueued on Redis.
2. `display_id` (human-friendly `DOC-000142`) is assigned by a Postgres BEFORE-INSERT trigger from sequence `document_display_seq`.
3. `worker` (ARQ) picks up the job → Google Cloud Vision OCR (az/ru/en). Falls back from direct PDF text extraction if available (`ocr_method` = `direct` | `vision`).
4. Extracted text chunked → OpenAI Embeddings API.
5. Vectors stored in pgvector (`document_chunks` table).
6. `ocr_status` progresses: `pending → processing → completed | failed`.
7. Failed OCR auto-retries up to 3 times; manual re-trigger via `POST /documents/{id}/reprocess`.

### Hybrid Search (`POST /search`)
Hybrid retrieval over documents, merged via **Reciprocal Rank Fusion** (`RRF_K=60`):
- **Semantic leg:** top-20 chunks by `embedding <=> query_embedding` (pgvector cosine)
- **FTS leg:** top-20 documents whose `search_vector` (tsvector on `ocr_text`, STORED GENERATED column) matches `plainto_tsquery('simple', :query)`
- Metadata filters apply to both legs: `category_id`, **`folder_id`**, **`department_id`**, **`doc_type`**, `tags`, `language`, date range.
- `ts_headline` produces the snippet for FTS hits; chunk text is the snippet for semantic hits.

### Document Browsing (`GET /documents`)
Filters: `ocr_status`, `doc_type`, `folder_id`, `department_id`, `year`, `created_from`, `created_to`, `sort` (`created_at:desc` default, also `title:asc/desc`, `display_id:asc/desc`, `updated_at:*`), `q` (ILIKE title OR `search_vector`).

### RAG / AI Chat Workflow (`POST /chat`, SSE stream)
1. User message → OpenAI embedding.
2. **Hybrid retrieval of top-8 chunks**, **org-wide** (no `user_id` filter):
   - Semantic: top-20 by embedding cosine
   - FTS: top-20 chunks matching `to_tsquery('simple', <OR-joined words>)` — **must be OR-joined**, not `plainto_tsquery`; natural-language questions like "which documents mention Aliyev" would otherwise require every word to co-occur in one chunk and return nothing.
   - tsquery operator chars (`& | ! ( ) : * < >`) are stripped from user input before being passed to `to_tsquery`.
3. Top-8 chunks + question sent to `claude-sonnet-4-6` via streaming.
4. SSE events: `text_delta` deltas → `citations` payload → `[DONE]`. Assistant message persisted after the stream.
5. Claude cites `[Source: {document_title}, Page {page_number}]` and replies in the user's language.

### Audit Log
`app/services/audit.py::log(...)` inserts an `AuditLog` row within the caller's transaction (call `db.flush()` first if you're referencing a just-created FK target — the register endpoint does this). Writes happen on: `user.login/register/admin_update/self_update/password_change`, `document.upload/update/delete/reprocess`, `folder.*`, `department.*`, `category.create/delete`. Reads are not audited.

---

## Key Data Models

| Model | Key Fields |
|---|---|
| `User` | id, email, password_hash, full_name, role (`admin`/`user`), language_preference, is_active |
| `Document` | id, **display_id** (`DOC-000001`), user_id (uploader), title, category_id, **folder_id**, **department_id**, **doc_type** (check: contract/invoice/report/letter/permit/other), **physical_location**, tags, language, file_path (MinIO key), ocr_status, ocr_text |
| `DocumentChunk` | id, document_id, chunk_index, chunk_text, embedding (vector), page_number |
| `Category` | id, name_az, name_ru, name_en (taxonomy tag) |
| `Folder` | id, parent_id (self-FK, adjacency list), name_az/ru/en (hierarchical org structure) |
| `Department` | id, name_az, name_ru, name_en |
| `ChatSession` | id, user_id, title (sessions stay per-user) |
| `ChatMessage` | id, session_id, role, content, source_chunks (refs) |
| `AuditLog` | id, user_id (nullable), action, entity_type, entity_id, `metadata` JSONB (Python attribute is `extra_data`), ip_address, user_agent, created_at |

Folder/Category coexist deliberately: **Folder = where the doc lives** (org tree, breadcrumb), **Category = taxonomy tag**.

---

## API Surface (Summary)

- **Auth:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- **Self:** `GET|PATCH /users/me`, `POST /users/me/password`
- **Documents:** `POST /documents/upload`, `GET /documents`, `GET /documents/{id}`, `PATCH /documents/{id}`, `DELETE /documents/{id}`, `GET /documents/{id}/file`, `GET /documents/{id}/ocr-text`, `POST /documents/{id}/reprocess`
- **Folders:** `GET /folders` (tree w/ localized paths + document_count), `POST /folders`, `PATCH /folders/{id}`, `DELETE /folders/{id}`
- **Search:** `POST /search`
- **Chat:** `POST /chat`, `GET /chat/sessions`, `GET /chat/sessions/{id}`, `DELETE /chat/sessions/{id}`
- **Admin users/categories:** `GET|PATCH /admin/users`, `GET|POST|DELETE /admin/categories`
- **Admin departments:** `GET|POST|PATCH|DELETE /admin/departments`
- **Admin reports:** `GET /admin/reports/stats`
- **Admin audit:** `GET /admin/audit-logs`

All endpoints require JWT authentication except `/auth/register` and `/auth/login`. All `/admin/*` and folder mutations require role=`admin`.

---

## Frontend conventions

- **Palette** (`frontend/tailwind.config.ts`): `brand.*` (dark green #2d5016, accent #7db542), `surface.*`, `edge.*`, `badge.{contract,invoice,report,letter,permit,other}.{bg,fg}`, `dot.{done,progress,pending,failed}`. Font: `font-brand` (Calibri stack).
- **Sidebar** (`components/Sidebar.tsx`): three sections — Library / Manage / Account. `Manage` is hidden for non-admins by reading `/users/me` via `useMe()`.
- **Shared primitives**: `DataTable`, `FilterBar` + chips/selects, `Badge` (DocTypeBadge + OcrStatusDot), `FolderPicker` (flattens tree) + `FolderBreadcrumb`, `UploadModal`, `TopBar`, `StatCard`.
- **i18n**: cookie-based (not URL-prefixed). Keys live in `frontend/i18n/{en,az,ru}.json`. Settings page writes `NEXT_LOCALE` cookie on save then reloads.
- **Auth**: middleware in `frontend/middleware.ts` gates all non-`/login|/register` routes by the `access_token` cookie. Axios interceptor (`lib/api.ts`) attaches `Authorization: Bearer …` from `localStorage` and auto-refreshes on 401.
- **Export**: `/documents` has a client-side CSV export that dumps the currently filtered view.

---

## Environment Variables

```
DATABASE_URL
MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME
GOOGLE_CLOUD_CREDENTIALS   # path to GCP service account JSON
OPENAI_API_KEY
ANTHROPIC_API_KEY
JWT_SECRET, JWT_EXPIRY_MINUTES
CORS_ORIGINS
```

---

## Development Setup

**Canonical (everything in Docker):**
```bash
docker compose up --build        # starts postgres, redis, minio, migrate, api, worker, frontend
```
- App: http://localhost:3000 — API + Swagger: http://localhost:8000/docs — MinIO console: http://localhost:9001
- The `migrate` service runs `alembic upgrade head` before `api` starts.
- After first boot, seed starter folders + departments: `docker compose exec api python -m scripts.seed_phase2`.

**Hot-reload flow (app code on host, infra in Docker):**
```bash
docker compose up postgres redis minio -d
cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload
# In another shell:
cd backend && arq app.workers.ocr_worker.WorkerSettings
cd frontend && npm install && npm run dev
```

### Reloading code changes

**⚠️ `api`, `worker`, and `migrate` bake source into the image — no volume mount.**
- `docker compose restart api` keeps running the *old* code.
- Backend change → `docker compose up -d --build api` (rebuild `migrate` too when adding migrations, then `docker compose run --rm migrate`).
- Frontend change → `docker compose up -d --build frontend`.
- Hot-reload only works in the host-Python flow above (`uvicorn --reload`).

### Common commands

```bash
# Tail logs
docker compose logs api --tail 50 -f
docker compose logs worker --tail 50 -f

# DB shell
docker compose exec postgres psql -U aidms -d aidms

# Apply new migrations (after a rebuild)
docker compose build migrate && docker compose run --rm migrate

# New migration (inside backend/)
alembic revision --autogenerate -m "describe change"
alembic upgrade head

# Seed departments + folder tree
docker compose exec api python -m scripts.seed_phase2

# Promote a user to admin
docker compose exec postgres psql -U aidms -d aidms \
  -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

---

## Important Constraints

- Max upload: 50 MB per PDF
- OCR + processing SLA: 60 s for a 10-page PDF
- Search response SLA: 2 s
- AI first-token latency SLA: 5 s
- **Visibility is organization-wide**: any authenticated user sees every document. Only the uploader or an admin can mutate.
- MinIO URLs must not be publicly accessible — always proxy through the backend (`GET /documents/{id}/file`).
- Passwords hashed with bcrypt; JWT uses refresh token rotation.
- All user-facing strings and error messages must be localised in az/ru/en (`frontend/i18n/{az,ru,en}.json`).
- `doc_type` is constrained by a CHECK to `{contract, invoice, report, letter, permit, other}`. Adding a value requires a migration.

## Gotchas

- **FTS on natural-language questions:** `plainto_tsquery` ANDs all words. For chat-style input, OR-join tokens and use `to_tsquery('simple', 'word1 | word2 | ...')`. Strip `& | ! ( ) : * < >` from user input first so `to_tsquery` doesn't raise.
- **`search_vector` is not in the ORM.** It's a generated/triggered column on `documents`; reference it via raw SQL (`text()`) in SQLAlchemy.
- **Embedding string interpolation.** pgvector queries f-string the embedding literal into the SQL (`'[0.1,0.2,...]'::vector`). The embedding comes from OpenAI, not user input — do not swap this pattern for raw user strings.
- **Audit on register.** The new user's row must be flushed (`await db.flush()`) before `audit.log(...)` references its id — otherwise the audit FK to `users.id` fails in the same transaction. See `routers/auth.py::register`.
- **`metadata` attribute collision.** The audit log column is `metadata` (JSONB), but `metadata` is a reserved attribute on SQLAlchemy's declarative `Base`. The Python attribute is therefore `extra_data`, mapped to the `metadata` column via positional arg to `mapped_column`. Pydantic `AuditLogResponse` exposes it as `metadata` in the JSON.
- **`display_id` is assigned by a DB trigger.** Never set it from app code on insert; the BEFORE-INSERT trigger fills it from `document_display_seq`. Updating is allowed but discouraged (breaks the "stable archive id" contract).
- **Folders use adjacency lists + recursive CTE.** `GET /folders` resolves full paths in SQL; client should not walk the tree manually. Cycle prevention on PATCH is enforced server-side (`routers/folders.py`).
- **Tailwind color key `border` is reserved as a utility prefix**, so the palette uses `edge.*` (e.g. `border-edge-soft`) instead.
- **Frontend routes are not locale-prefixed.** next-intl uses a cookie (`NEXT_LOCALE`). `/settings` writes the cookie and then reloads so the whole tree re-renders in the chosen language.
