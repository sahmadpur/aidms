# AI-Powered Multilingual DMS

An AI-powered document management system supporting Azerbaijani, Russian, and English. Upload PDFs, run OCR, and ask questions about your documents via a streaming AI chat interface.

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

## 3. Create Admin User

1. Open `http://localhost:8000/docs`
2. Use `POST /auth/register` to create your first user
3. Promote to admin directly in the database:

```bash
docker compose exec postgres psql -U aidms -d aidms \
  -c "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

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
