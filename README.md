# DocArchive AI — Multilingual Document Management

An AI-powered, organization-wide document archive supporting Azerbaijani, Russian, and English. Upload PDFs, run OCR, organise them by folders / type / department / physical shelf location, search them semantically, and ask Claude about them via streaming RAG chat.

**Phase 2 additions** (see `docs/REQUIREMENTS.md` for the full spec):
- Hierarchical **folders** alongside the flat taxonomy (categories).
- **Physical location** tracking (e.g. `Shelf B-3, Box 12`) for paper archives.
- First-class **document type** (contract / invoice / report / letter / permit / other) and **department** fields.
- Human-friendly **display ID** (`DOC-000001`) assigned by a Postgres trigger.
- **Org-wide visibility** — every authenticated user sees every document; only the uploader or an admin can mutate.
- New admin screens: **Reports** (stats + 30-day chart), **Audit Log**, **Departments**, **Folders** CRUD.
- User-facing **Settings** (profile + password change).
- Client-side **CSV export** of the filtered Documents view.

## Prerequisites

- Docker & Docker Compose
- Python 3.12+
- Node.js 20+
- `poppler-utils` (for PDF → image conversion): `brew install poppler` on macOS
- A Google Cloud project with **Cloud Vision API** enabled
- OpenAI API key (embeddings)
- Anthropic API key (Claude chat)

## 1. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `POSTGRES_PASSWORD` — choose any password
- `GOOGLE_CLOUD_CREDENTIALS` — path to your GCP service account JSON file (mounted into the container below)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `JWT_SECRET` — a long random string

### Google Cloud Vision Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Cloud Vision API**
3. Create a service account with the `Cloud Vision API User` role
4. Download the JSON key file
5. Set `GOOGLE_CLOUD_CREDENTIALS=/run/secrets/gcp.json` in `.env` (or any path you mount)

> **Tip:** Mount your GCP key into the backend containers by adding a volume to the `api` and `worker` services in `docker-compose.yml`:
> ```yaml
> volumes:
>   - /local/path/to/key.json:/run/secrets/gcp.json:ro
> ```

## 2. Start Everything

```bash
docker compose up --build
```

This starts all services in the correct order:

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API + Swagger | http://localhost:8000/docs |
| MinIO console | http://localhost:9001 |

The `migrate` service runs `alembic upgrade head` automatically before the API starts. The `worker` service handles OCR + embedding jobs in the background.

## 3. Seed starter folders + departments

After the first boot, populate the starter tree so the UI isn't empty:

```bash
docker compose exec api python -m scripts.seed_phase2
```

Idempotent — re-run any time; existing rows are skipped.

## 4. Create Admin User

1. Open `http://localhost:8000/docs`
2. Use `POST /auth/register` to create your first user
3. Promote to admin directly in the database:

```bash
docker compose exec postgres psql -U aidms -d aidms \
  -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

## Production Deployment (server: `ahmadpur.org`)

The server at `173.249.38.125` fronts every service with Traefik + Cloudflare Tunnel (`/home/n8n-compose/`). The tunnel has two public hostnames pointing at this box:

- `dms.ahmadpur.org` → frontend
- `api.dms.ahmadpur.org` → backend

Traefik joins the services on the existing `n8n-compose_default` Docker network; TLS is terminated at Cloudflare, so Traefik only does host-based routing inside the box. The override file `docker-compose.prod.yml` wires this up.

### First-time setup

```bash
ssh root@173.249.38.125
cd /home
git clone https://github.com/sahmadpur/aidms.git dms-compose
cd dms-compose

# GCP service account JSON (copy from your laptop):
#   scp "alert-parsec-413511-e8c5dac46694.json" root@173.249.38.125:/home/dms-compose/

# Create .env (see Environment Variables Reference below). Key values for prod:
#   CORS_ORIGINS=["https://dms.ahmadpur.org"]
#   JWT_SECRET=<64 random bytes, e.g. openssl rand -hex 32>
#   POSTGRES_PASSWORD=<random>
#   MINIO_SECRET_KEY=<random>
#   GOOGLE_CLOUD_CREDENTIALS=/run/secrets/gcp.json

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec api python -m scripts.seed_phase2
```

Then register your first user via `https://api.dms.ahmadpur.org/docs` → `POST /auth/register`, and promote to admin:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec postgres \
  psql -U aidms -d aidms -c "UPDATE users SET role = 'admin' WHERE email = 'you@example.com';"
```

### Future deploys

```bash
ssh root@173.249.38.125
cd /home/dms-compose
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

`migrate` runs `alembic upgrade head` before `api` comes up, so schema changes apply automatically.

**Tail logs** while deploying:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f api worker frontend
```

**Rebuilding just one service** (faster than the full stack):
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build api worker
```

> The base `docker-compose.yml` publishes host ports (5432, 6379, 9000, 8000, 3000). The prod override clears those with `!reset` so nothing is exposed outside the Docker network — all traffic goes through Traefik.

## Local Development (without Docker for app code)

If you want hot-reload while developing, run infra in Docker and the app locally:

```bash
# Infra only
docker compose up postgres redis minio -d

# Backend (hot-reload)
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload

# Worker
arq app.workers.ocr_worker.WorkerSettings

# Frontend (hot-reload)
cd frontend
npm install && npm run dev
```

## Architecture

```
Browser (Next.js 14)
  ↓  REST + SSE
FastAPI Backend
  ├── PostgreSQL + pgvector  (documents, chunks, users, chat)
  ├── Redis                  (ARQ job queue)
  └── MinIO                  (PDF file storage)

Background Worker (ARQ)
  ├── Google Cloud Vision    (OCR: PDF → text)
  ├── OpenAI Embeddings      (text → vector(1536))
  └── pgvector               (store + query embeddings)

Chat
  └── Anthropic Claude       (RAG response, streaming SSE)
```

## Key Workflows

### Document Upload
1. Upload PDF(s) via drag-and-drop (max 50 MB each)
2. File stored in MinIO; metadata record in PostgreSQL (`ocr_status=pending`)
3. ARQ worker picks up the job → Google Cloud Vision OCR
4. Text chunked (800 tokens, 100 overlap) → OpenAI embeddings → stored in pgvector
5. `ocr_status` updates to `completed` (auto-refreshed in the UI every 5s)

### Document Browsing
- `GET /documents` supports a `q` query param that filters by title (ILIKE) **or** OCR text content (`tsvector`), so users can locate a document by a word inside it, not just its filename
- The Documents page has a debounced search box wired to this parameter

### Semantic Search
- Query embedded via OpenAI → cosine similarity in pgvector
- Full-text search via PostgreSQL `tsvector`
- Results merged with Reciprocal Rank Fusion

### AI Chat
- Hybrid retrieval, same RRF approach as `/search`:
  1. Semantic search — top-20 chunks by embedding cosine distance
  2. Full-text search — top-20 chunks matching any query word on `to_tsvector('simple', chunk_text)` (OR-joined so asking "which documents mention Aliyev" still matches chunks containing only "Aliyev")
  3. Merged via RRF → top-8 chunks sent to Claude
- `tsquery` operator characters (`& | ! ( ) : * < >`) are stripped from user input to keep the query safe
- Chunks + question streamed to `claude-sonnet-4-6`; citations delivered after the stream ends

## Environment Variables Reference

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `REDIS_URL` | Redis connection string |
| `MINIO_ENDPOINT` | MinIO host:port |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `MINIO_BUCKET_NAME` | Bucket name for documents |
| `MINIO_SECURE` | Use HTTPS for MinIO (false for local) |
| `GOOGLE_CLOUD_CREDENTIALS` | Path to GCP service account JSON |
| `OPENAI_API_KEY` | OpenAI API key (embeddings) |
| `ANTHROPIC_API_KEY` | Anthropic API key (Claude) |
| `JWT_SECRET` | Secret for JWT signing |
| `JWT_EXPIRY_MINUTES` | Access token TTL (default: 30) |
| `JWT_REFRESH_EXPIRY_DAYS` | Refresh token TTL (default: 7) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `MAX_UPLOAD_SIZE_MB` | Max upload size (default: 50) |

## API Documentation

Auto-generated Swagger UI: `http://localhost:8000/docs`

All endpoints require JWT authentication except:
- `POST /auth/register`
- `POST /auth/login`
- `GET /health`
