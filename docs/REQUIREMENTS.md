# AI-Powered Document Management Platform — Requirements

> **Version:** 2.0  
> **Last Updated:** April 17, 2026  
> **Author:** Sohrab (Senior Business Analyst)  
> **Status:** Phase 2 shipped (records-management uplift)

---

## 1. Project Overview

### 1.1 Purpose

A multilingual, AI-powered document management platform designed for uploading, storing, searching, and interacting with documents through an intelligent chat interface. The system handles scanned/handwritten documents via OCR, supports semantic search, and provides AI-driven Q&A over the document corpus.

### 1.2 Target Languages

- Azerbaijani (az)
- Russian (ru)
- English (en)

All user-facing interfaces, OCR pipelines, and AI responses must support all three languages.

### 1.3 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) |
| Backend API | FastAPI (Python) |
| Database | PostgreSQL + pgvector |
| Object Storage | MinIO |
| OCR Engine | Google Cloud Vision API |
| Embeddings | OpenAI Embeddings API |
| AI Chat | Anthropic Claude API |

---

## 2. Functional Requirements

### 2.1 Document Upload

- **FR-2.1.1** — The system must allow users to upload PDF documents via a drag-and-drop interface or file picker.
- **FR-2.1.2** — Accepted file format: PDF (`.pdf`). Other formats may be added in future iterations.
- **FR-2.1.3** — Maximum file size: 50 MB per document.
- **FR-2.1.4** — The system must display an upload progress indicator with percentage.
- **FR-2.1.5** — Upon successful upload, the document must be stored in MinIO object storage and a metadata record created in PostgreSQL.
- **FR-2.1.6** — Bulk upload of multiple documents in a single session must be supported.

### 2.2 OCR Processing

- **FR-2.2.1** — All uploaded PDFs must be automatically sent through the OCR pipeline.
- **FR-2.2.2** — The OCR engine (Google Cloud Vision) must extract text from both printed and handwritten documents.
- **FR-2.2.3** — OCR must correctly recognize text in Azerbaijani, Russian, and English.
- **FR-2.2.4** — Extracted text must be stored alongside the document metadata in the database.
- **FR-2.2.5** — The system must indicate OCR processing status: `pending`, `processing`, `completed`, `failed`.
- **FR-2.2.6** — If OCR fails, the system must log the error and allow manual re-trigger.

### 2.3 Document Metadata

- **FR-2.3.1** — Each document must have the following metadata fields:
  - Document title (user-editable)
  - Upload date (auto-generated)
  - Document type / category (user-selectable from predefined list)
  - Tags (user-defined, freeform)
  - Language (auto-detected or user-selected)
  - OCR status
  - Source / origin (optional)
  - Description / notes (optional)
- **FR-2.3.2** — Users must be able to edit metadata after upload.
- **FR-2.3.3** — The category list must be admin-configurable.

### 2.4 Document Search

- **FR-2.4.1** — The system must support full-text search across extracted OCR content.
- **FR-2.4.2** — The system must support metadata-based filtering (by category, tags, date range, language).
- **FR-2.4.3** — The system must support semantic search using vector embeddings (pgvector) — users can search by meaning, not just keywords.
- **FR-2.4.4** — Search results must display: document title, relevance score, snippet of matching text, upload date, and category.
- **FR-2.4.5** — Search must work across all three supported languages.
- **FR-2.4.6** — Combined search (metadata filters + text/semantic query) must be supported.

### 2.5 Document Viewer

- **FR-2.5.1** — Users must be able to preview PDF documents in-browser without downloading.
- **FR-2.5.2** — The viewer must support page navigation, zoom, and full-screen mode.
- **FR-2.5.3** — The extracted OCR text must be viewable alongside the original document.

### 2.6 AI Chat Interface

- **FR-2.6.1** — The system must provide a conversational AI chat interface powered by Anthropic Claude.
- **FR-2.6.2** — Users can ask questions about uploaded documents and receive context-aware answers.
- **FR-2.6.3** — The AI must retrieve relevant document chunks via semantic search (RAG pipeline) before generating a response.
- **FR-2.6.4** — The AI must cite the source document(s) and page number(s) in its responses.
- **FR-2.6.5** — The chat must support follow-up questions within the same conversation session.
- **FR-2.6.6** — The AI must respond in the same language the user writes in (auto-detect).
- **FR-2.6.7** — Chat history must be persisted per user session.
- **FR-2.6.8** — Users must be able to start a new chat or return to previous conversations.

### 2.7 User Management

- **FR-2.7.1** — The system must support user registration and login (email + password).
- **FR-2.7.2** — Role-based access control with at minimum two roles: `admin` and `user`.
- **FR-2.7.3** — Admins can manage users, configure categories, and view system-wide analytics.
- **FR-2.7.4** — Users can only access their own documents unless explicitly shared.
- **FR-2.7.5** — Authentication must use JWT tokens with refresh token rotation.

### 2.8 Document Sharing (deferred)

The per-user document sharing originally scoped for Phase 2 was **superseded** by the Phase 2 visibility model (see §2.9). If per-document ACLs are revisited later, they'd layer on top of the org-wide default.

### 2.9 Phase 2 — Records-Management Uplift (shipped)

Phase 2 reframes the product from "personal PDF drawer" to **"DocArchive AI" — an organization-wide records archive**. See `artifact.html` at the repo root for the visual reference.

#### 2.9.1 Visibility model
- **FR-2.9.1.1** — Every authenticated user sees every document. `user_id` becomes the uploader (audit only), not an access filter.
- **FR-2.9.1.2** — Only the uploader **or** an administrator may PATCH, DELETE, or re-trigger OCR on a document.

#### 2.9.2 New document fields
- **FR-2.9.2.1 `folder_id`** — optional FK to a hierarchical `folders` tree (adjacency list, multilingual names). Folders are organisational ("where the doc lives") and complement the existing flat `categories` taxonomy ("what the doc is about").
- **FR-2.9.2.2 `doc_type`** — optional enum with values `contract | invoice | report | letter | permit | other` (enforced by a Postgres CHECK constraint). Rendered as a colored badge.
- **FR-2.9.2.3 `department_id`** — optional FK to `departments` (multilingual; parallels categories).
- **FR-2.9.2.4 `physical_location`** — free-text field (e.g. `Shelf B-3, Box 12`) for archived paper originals.
- **FR-2.9.2.5 `display_id`** — human-friendly identifier `DOC-000001`, assigned by a BEFORE-INSERT Postgres trigger from sequence `document_display_seq`. UUIDs remain the primary key and URL identifier; `display_id` is shown in the UI and in exports.

#### 2.9.3 Folders
- **FR-2.9.3.1** — Admins may create, rename, move, and delete folders via `POST/PATCH/DELETE /folders`.
- **FR-2.9.3.2** — Cycle prevention is enforced on move: a folder may not become its own descendant.
- **FR-2.9.3.3** — Deleting a folder does **not** cascade to its documents or subfolders; `ON DELETE SET NULL` ensures orphans are reparented to the root.
- **FR-2.9.3.4** — `GET /folders` returns the full tree with localised paths (`path_az`, `path_ru`, `path_en`) and a `document_count` per node.
- **FR-2.9.3.5** — All authenticated users can browse folders (`/folders`). CRUD is admin-only.

#### 2.9.4 Departments
- **FR-2.9.4.1** — Admins may create / rename / delete departments via `/admin/departments`. All users may list them to populate filters and pickers.

#### 2.9.5 Filtering + Sorting
- **FR-2.9.5.1** — `GET /documents` supports filters: `folder_id`, `doc_type`, `department_id`, `year`, `created_from`, `created_to`, plus existing `ocr_status` and `q`.
- **FR-2.9.5.2** — `sort` param accepts `{created_at,title,display_id,updated_at}:{asc,desc}`; default `created_at:desc`.
- **FR-2.9.5.3** — `POST /search` hybrid-search filters extend to `folder_id`, `doc_type`, `department_id`.

#### 2.9.6 Audit Log
- **FR-2.9.6.1** — All mutations (login, register, document upload/patch/delete/reprocess, folder/department/category/user-role mutations, self-profile and password changes) emit an `audit_logs` row with user_id, action, entity_type, entity_id, JSONB metadata, IP, and user-agent.
- **FR-2.9.6.2** — Reads are not audited.
- **FR-2.9.6.3** — `GET /admin/audit-logs` is paginated and filterable by `user_id`, `action`, `entity_type`, and date range.

#### 2.9.7 Reports
- **FR-2.9.7.1** — `GET /admin/reports/stats` returns: totals, breakdown by OCR status, by doc_type, by department, uploads per day (last 30 days), top uploaders. Admin-only.

#### 2.9.8 Settings
- **FR-2.9.8.1** — Every user can view and edit their own profile (`full_name`, `language_preference`) via `PATCH /users/me`.
- **FR-2.9.8.2** — Password change via `POST /users/me/password` requires the current password.
- **FR-2.9.8.3** — Changing interface language updates the `NEXT_LOCALE` cookie and reloads the page so the whole tree re-renders.

#### 2.9.9 UI / visual
- **FR-2.9.9.1** — The UI adopts the DocArchive AI visual identity: dark-green sidebar (`#2d5016`), Calibri font stack, badge-coloured document types, compact data tables. Sidebar is grouped into **Library / Manage / Account**; the `Manage` section is hidden for non-admins.
- **FR-2.9.9.2** — Documents list has a top bar (title + search + Filter / Export / Upload) and a filter row (Type chips, Year, Department, OCR status) above a sortable, paginated table matching `artifact.html`.
- **FR-2.9.9.3** — A client-side CSV **Export** of the filtered Documents view is available from the top bar.

---

## 3. Non-Functional Requirements

### 3.1 Performance

- **NFR-3.1.1** — Document upload and OCR processing must complete within 60 seconds for a standard 10-page PDF.
- **NFR-3.1.2** — Search results must return within 2 seconds.
- **NFR-3.1.3** — AI chat response latency must not exceed 5 seconds for first token.
- **NFR-3.1.4** — The system must handle at least 50 concurrent users without degradation.

### 3.2 Scalability

- **NFR-3.2.1** — The architecture must support horizontal scaling of the FastAPI backend.
- **NFR-3.2.2** — MinIO storage must be expandable without downtime.
- **NFR-3.2.3** — The vector database (pgvector) must handle at least 1 million document chunks.

### 3.3 Security

- **NFR-3.3.1** — All API endpoints must require authentication (except login/register).
- **NFR-3.3.2** — All data in transit must use HTTPS/TLS.
- **NFR-3.3.3** — Uploaded files must be stored with access control; direct MinIO URLs must not be publicly accessible.
- **NFR-3.3.4** — User passwords must be hashed using bcrypt.
- **NFR-3.3.5** — API rate limiting must be enforced (configurable per endpoint).
- **NFR-3.3.6** — Input validation and sanitization on all user inputs.

### 3.4 Reliability

- **NFR-3.4.1** — The system must have 99.5% uptime (excluding planned maintenance).
- **NFR-3.4.2** — Failed OCR jobs must be automatically retried up to 3 times.
- **NFR-3.4.3** — Database backups must run daily with 30-day retention.

### 3.5 Usability

- **NFR-3.5.1** — The UI must be responsive and functional on desktop and tablet browsers.
- **NFR-3.5.2** — The interface language must be switchable between AZ / RU / EN without page reload.
- **NFR-3.5.3** — All user-facing error messages must be displayed in the user's selected language.
- **NFR-3.5.4** — The system must provide clear loading states and feedback for all async operations.

### 3.6 Maintainability

- **NFR-3.6.1** — Backend API must follow OpenAPI 3.0 specification with auto-generated docs (Swagger UI).
- **NFR-3.6.2** — Codebase must include a README with setup, configuration, and deployment instructions.
- **NFR-3.6.3** — Environment variables must be used for all secrets and configuration values.
- **NFR-3.6.4** — Docker Compose must be provided for local development.

---

## 4. System Architecture (High-Level)

```
┌──────────────┐       ┌──────────────┐       ┌──────────────────┐
│   Next.js    │◄─────►│   FastAPI     │◄─────►│   PostgreSQL     │
│   Frontend   │  REST │   Backend     │       │   + pgvector     │
└──────────────┘       └──────┬───────┘       └──────────────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
        ┌──────────┐  ┌────────────┐  ┌──────────────┐
        │  MinIO   │  │  Google    │  │  OpenAI      │
        │  Storage │  │  Cloud     │  │  Embeddings  │
        └──────────┘  │  Vision    │  └──────────────┘
                      └────────────┘
                                          ┌──────────────┐
                                          │  Anthropic   │
                                          │  Claude API  │
                                          └──────────────┘
```

---

## 5. Core Workflows

### 5.1 Document Ingestion Pipeline

1. User uploads PDF via frontend.
2. Frontend sends file to FastAPI `/upload` endpoint.
3. Backend stores file in MinIO, creates metadata record in PostgreSQL.
4. Background worker sends PDF to Google Cloud Vision for OCR.
5. Extracted text is stored in PostgreSQL.
6. Text is chunked and sent to OpenAI Embeddings API.
7. Embedding vectors are stored in pgvector.
8. Document status updated to `completed`.

### 5.2 Search Workflow

1. User enters search query.
2. Backend generates embedding for the query via OpenAI.
3. pgvector performs cosine similarity search against stored embeddings.
4. Results are combined with any metadata filters applied.
5. Ranked results returned to frontend with text snippets.

### 5.3 AI Chat Workflow

1. User sends a question via the chat interface.
2. Backend generates an embedding for the question.
3. Top-k relevant document chunks retrieved via pgvector.
4. Retrieved chunks + user question sent to Claude API as context.
5. Claude generates a cited, contextual response.
6. Response streamed back to the user in the chat UI.

---

## 6. API Endpoints (Summary)

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/login` | Login, returns JWT |
| POST | `/auth/refresh` | Refresh access token |

### Documents
| Method | Endpoint | Description |
|---|---|---|
| POST | `/documents/upload` | Upload a new document |
| GET | `/documents` | List user's documents (paginated) |
| GET | `/documents/{id}` | Get document details + metadata |
| PATCH | `/documents/{id}` | Update document metadata |
| DELETE | `/documents/{id}` | Delete a document |
| GET | `/documents/{id}/file` | Download/stream the original PDF |
| GET | `/documents/{id}/ocr-text` | Get extracted OCR text |
| POST | `/documents/{id}/reprocess` | Re-trigger OCR pipeline |

### Search
| Method | Endpoint | Description |
|---|---|---|
| POST | `/search` | Semantic + metadata search |

### Chat
| Method | Endpoint | Description |
|---|---|---|
| POST | `/chat` | Send a message, receive AI response |
| GET | `/chat/sessions` | List user's chat sessions |
| GET | `/chat/sessions/{id}` | Get chat history for a session |
| DELETE | `/chat/sessions/{id}` | Delete a chat session |

### Admin
| Method | Endpoint | Description |
|---|---|---|
| GET | `/admin/users` | List all users |
| PATCH | `/admin/users/{id}` | Update user role |
| GET | `/admin/categories` | List document categories |
| POST | `/admin/categories` | Create a new category |
| DELETE | `/admin/categories/{id}` | Delete a category |

---

## 7. Data Models (Conceptual)

### User
- id, email, password_hash, full_name, role, language_preference, created_at, updated_at

### Document
- id, user_id, title, category_id, tags, language, description, source, file_path (MinIO key), ocr_status, ocr_text, created_at, updated_at

### DocumentChunk
- id, document_id, chunk_index, chunk_text, embedding (vector), page_number

### Category
- id, name_az, name_ru, name_en, created_at

### ChatSession
- id, user_id, title, created_at, updated_at

### ChatMessage
- id, session_id, role (user/assistant), content, source_chunks (references), created_at

---

## 8. Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `MINIO_ENDPOINT` | MinIO server URL |
| `MINIO_ACCESS_KEY` | MinIO access key |
| `MINIO_SECRET_KEY` | MinIO secret key |
| `MINIO_BUCKET_NAME` | Bucket for document storage |
| `GOOGLE_CLOUD_CREDENTIALS` | Path to GCP service account JSON |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `JWT_SECRET` | Secret key for JWT signing |
| `JWT_EXPIRY_MINUTES` | Access token expiry |
| `CORS_ORIGINS` | Allowed frontend origins |

---

## 9. Acceptance Criteria

| # | Criteria | Priority |
|---|---|---|
| AC-1 | User can upload a PDF and see it listed in their documents | P0 |
| AC-2 | OCR extracts readable text from scanned/handwritten PDFs in all 3 languages | P0 |
| AC-3 | Semantic search returns relevant documents when queried by meaning | P0 |
| AC-4 | AI chat answers questions about uploaded documents with source citations | P0 |
| AC-5 | Metadata search filters work correctly (category, tags, date, language) | P0 |
| AC-6 | User authentication and authorization work correctly | P0 |
| AC-7 | PDF viewer renders documents in-browser with page navigation | P1 |
| AC-8 | UI language can be switched between AZ / RU / EN | P1 |
| AC-9 | Chat history is persisted and retrievable | P1 |
| AC-10 | Admin can manage categories and users | P1 |
| AC-11 | Document sharing between users works | Superseded by AC-13 (org-wide visibility) |
| AC-13 | Folders + doc_type + department + physical_location fields exist on documents and filter correctly | P0 (Phase 2 — done) |
| AC-14 | Display ID `DOC-000001` is assigned on upload and unique | P0 (Phase 2 — done) |
| AC-15 | Audit log captures all mutations | P1 (Phase 2 — done) |
| AC-16 | Admin reports page shows totals, charts, and top uploaders | P1 (Phase 2 — done) |
| AC-17 | Non-admins cannot access `/admin/*` routes (server 403 + sidebar hides `Manage`) | P0 (Phase 2 — done) |
| AC-12 | System handles 50 concurrent users without degradation | P1 |

---

## 10. Out of Scope (v1)

- Mobile native apps (iOS / Android)
- Real-time collaborative document editing
- E-signature / digital signing
- Integration with external DMS (SharePoint, Google Drive)
- Advanced analytics dashboard
- Workflow / approval chains
- Email notifications

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Google Cloud Vision OCR accuracy on handwritten Azerbaijani text | Reduced search quality | Test with real document samples early; consider fallback OCR model |
| High API costs (OpenAI embeddings + Claude) at scale | Budget overrun | Implement caching, batch processing, and usage monitoring |
| Large PDF processing timeouts | Poor user experience | Use async background workers with status polling |
| pgvector performance at scale | Slow search | Index tuning, partitioning, and monitoring from day one |

---

## 12. Glossary

| Term | Definition |
|---|---|
| **RAG** | Retrieval-Augmented Generation — enriching AI responses with retrieved document context |
| **OCR** | Optical Character Recognition — extracting text from images/scans |
| **pgvector** | PostgreSQL extension for storing and querying vector embeddings |
| **Embedding** | A numerical vector representation of text used for semantic similarity |
| **Chunk** | A segment of document text (typically 500–1000 tokens) used for embedding and retrieval |
| **MinIO** | Self-hosted S3-compatible object storage |

---

*End of Requirements Document*
