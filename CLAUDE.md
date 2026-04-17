# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered multilingual Document Management System (DMS). Users upload PDFs, the system runs OCR, chunks and embeds the text, and exposes semantic search and an AI chat interface (RAG) over the document corpus. Supported languages: Azerbaijani (az), Russian (ru), English (en).

`docs/REQUIREMENTS.md` is the authoritative spec. The canonical runtime is Docker Compose; see **Development Setup** below.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend API | FastAPI (Python) |
| Database | PostgreSQL + pgvector |
| Object Storage | MinIO (S3-compatible) |
| OCR | Google Cloud Vision API |
| Embeddings | OpenAI Embeddings API |
| AI Chat | Anthropic Claude API (streaming) |

---

## Project Structure

```
frontend/          # Next.js 14 App Router app (i18n az/ru/en via next-intl)
backend/           # FastAPI Python app
  app/
    routers/       # auth, documents, search, chat, admin
    models/        # SQLAlchemy ORM models
    schemas/       # Pydantic request/response schemas
    services/      # ocr, embeddings, storage (MinIO), chat, search
    workers/       # ARQ workers (OCR + embedding jobs)
  alembic/         # DB migrations (applied automatically by `migrate` service)
docker-compose.yml # postgres+pgvector, redis, minio, migrate, api, worker, frontend
```

---

## Architecture & Core Workflows

### Document Ingestion Pipeline
1. PDF uploaded → stored in MinIO, metadata row in PostgreSQL, ARQ job enqueued on Redis
2. `worker` (ARQ) picks up the job → Google Cloud Vision OCR (az/ru/en). Falls back from direct PDF text extraction if available (`ocr_method` = `direct` | `vision`)
3. Extracted text chunked → OpenAI Embeddings API
4. Vectors stored in pgvector (`document_chunks` table)
5. Document `ocr_status` progresses: `pending → processing → completed | failed`
6. Failed OCR auto-retries up to 3 times; manual re-trigger via `POST /documents/{id}/reprocess`

### Search (`POST /search`)
Hybrid retrieval over `document_chunks`, merged via **Reciprocal Rank Fusion** (`RRF_K=60`):
- **Semantic leg:** top-20 chunks by `embedding <=> query_embedding` (pgvector cosine)
- **FTS leg:** top-20 documents whose `search_vector` (tsvector on `ocr_text`, maintained by trigger) matches `plainto_tsquery('simple', :query)`
- Metadata filters (category_id, tags, language, date range) apply to both legs
- `ts_headline` produces the snippet for FTS hits; chunk text is the snippet for semantic hits

### Document Browsing (`GET /documents`)
- Optional `q` param filters by title (ILIKE) **or** OCR text content (`search_vector @@ plainto_tsquery('simple', :q)`). The Documents page wires a debounced search input to this.

### RAG / AI Chat Workflow (`POST /chat`, SSE stream)
1. User message → OpenAI embedding
2. **Hybrid retrieval of top-8 chunks** (same RRF pattern as `/search`, but over chunks):
   - Semantic: top-20 by embedding cosine
   - FTS: top-20 chunks matching `to_tsquery('simple', <OR-joined words>)` — **must be OR-joined**, not `plainto_tsquery`; natural-language questions like "which documents mention Aliyev" would otherwise require every word to co-occur in one chunk and return nothing
   - tsquery operator chars (`& | ! ( ) : * < >`) are stripped from user input before being passed to `to_tsquery`
3. Top-8 chunks + question sent to `claude-sonnet-4-6` via streaming (`anthropic.AsyncAnthropic.messages.stream`)
4. SSE events: `text_delta` deltas → `citations` payload → `[DONE]`. Assistant message (with `source_chunks`) persisted after the stream completes
5. Claude must cite `[Source: {document_title}, Page {page_number}]` and reply in the user's language (auto-detect)

---

## Key Data Models

| Model | Key Fields |
|---|---|
| `User` | id, email, password_hash, role (`admin`/`user`), language_preference |
| `Document` | id, user_id, title, category_id, tags, language, file_path (MinIO key), ocr_status, ocr_text |
| `DocumentChunk` | id, document_id, chunk_index, chunk_text, embedding (vector), page_number |
| `Category` | id, name_az, name_ru, name_en |
| `ChatSession` | id, user_id, title |
| `ChatMessage` | id, session_id, role (user/assistant), content, source_chunks (refs) |

---

## API Surface (Summary)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`
- `POST /documents/upload`, `GET /documents`, `GET /documents/{id}`, `PATCH /documents/{id}`, `DELETE /documents/{id}`
- `GET /documents/{id}/file`, `GET /documents/{id}/ocr-text`, `POST /documents/{id}/reprocess`
- `POST /search`
- `POST /chat`, `GET /chat/sessions`, `GET /chat/sessions/{id}`, `DELETE /chat/sessions/{id}`
- `GET|POST /admin/users`, `GET|POST|DELETE /admin/categories`

All endpoints require JWT authentication except `/auth/register` and `/auth/login`.

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

**Hot-reload flow (app code on host, infra in Docker):**
```bash
docker compose up postgres redis minio -d
cd backend && pip install -r requirements.txt && alembic upgrade head && uvicorn app.main:app --reload
# In another shell:
cd backend && arq app.workers.ocr_worker.WorkerSettings
cd frontend && npm install && npm run dev
```

### Reloading code changes

**⚠️ `api` and `worker` bake source into the image — there is no volume mount.**
- `docker compose restart api` keeps running the *old* code.
- To pick up backend changes you must rebuild: `docker compose up -d --build api` (or `worker`).
- Hot-reload only works in the host-Python flow above (`uvicorn --reload`).

### Common commands

```bash
# Tail logs
docker compose logs api --tail 50 -f
docker compose logs worker --tail 50 -f

# DB shell
docker compose exec postgres psql -U aidms -d aidms

# New migration (inside backend/)
alembic revision --autogenerate -m "describe change"
alembic upgrade head

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
- Document sharing (Phase 2) is out of scope for v1
- MinIO URLs must not be publicly accessible — always proxy through the backend (`GET /documents/{id}/file`)
- Passwords hashed with bcrypt; JWT uses refresh token rotation
- All user-facing strings and error messages must be localised in az/ru/en (`frontend/i18n/{az,ru,en}.json`)

## Gotchas

- **FTS on natural-language questions:** `plainto_tsquery` ANDs all words. For chat-style input, OR-join tokens and use `to_tsquery('simple', 'word1 | word2 | ...')`. Strip `& | ! ( ) : * < >` from user input first so `to_tsquery` doesn't raise.
- **`search_vector` is not in the ORM.** It's a generated/triggered column on `documents`; reference it via raw SQL (`text()`) in SQLAlchemy.
- **Embedding string interpolation.** pgvector queries f-string the embedding literal into the SQL (`'[0.1,0.2,...]'::vector`). The embedding comes from OpenAI, not user input — do not swap this pattern for raw user strings.
