# DocArchive AI — Functionality Overview

A plain-language description of what DocArchive AI does, written for business stakeholders (management, reviewers, end users). For the technical specification, see `docs/REQUIREMENTS.md` and `CLAUDE.md`.

---

## What it is

DocArchive AI is the organization's central **digital archive** for scanned paper documents — contracts, invoices, reports, letters, permits, and anything else that needs to live in one searchable place. Users upload scanned PDFs; the system reads them (including handwritten or low-quality scans, in Azerbaijani, Russian, and English), files them, and makes them instantly findable by anyone in the organization.

The interface is available in three languages (Azerbaijani, Russian, English) and every user can switch between them independently.

---

## Today's functionality

### 1. Upload and automatic processing
- Any authenticated user can upload a PDF (up to 50 MB) from the **Documents** page.
- At upload the user attaches some metadata: department, folder, document type (contract / invoice / report / letter / permit / other), physical location (e.g. *"Shelf B-14, Cabinet 2"*), and free-text tags.
- In the background the system **automatically reads the scanned text** (OCR) in the right language and makes the document fully text-searchable within a minute or two.
- Each document receives a permanent, human-readable archive ID (`DOC-000142`) that's stable for its lifetime and safe to reference in emails, letters, and physical labels.

### 2. Browse and find
- The **Documents** list is the master index: filter by department, folder, document type, date range, OCR status; sort by archive ID, title, or upload date; search by title.
- **Folders** organise documents in a hierarchy that mirrors the organization's structure (e.g. *Finance → 2024 → Contracts*). Folders are the "where the document lives" view.
- **Categories** are a lighter taxonomy — a tag system that cuts across folders (e.g. the category *"Regulatory"* can apply to documents in several folders).
- A **CSV export** of the currently filtered view is one click away — useful for audits, reports to management, or handing a list to a colleague.

### 3. Search — find any document by what it says
- **Full-text search** across every document's contents. You type words, the system finds documents that contain them.
- **Semantic search** on top of that: the system also understands meaning, so a search for "*leasing agreements expiring in Q2*" finds relevant documents even if those exact words don't appear.
- Results highlight the exact passage that matched and link straight to the document.

### 4. AI Chat — ask questions of your archive
- The **Chat** page lets users ask questions in natural language (any of the three languages) and receive answers assembled from the contents of actual documents in the archive.
- Every answer **cites its sources** — which document, which page — so claims can always be verified against the original.
- The conversation history is kept per user; users can return to past sessions.

### 5. Physical-shelf tracking
- Every digital document can record **where its paper original lives** — shelf, room, cabinet. This turns the digital archive into the definitive index for the physical archive too.

### 6. User management and access
- Two roles: **User** (can upload and read) and **Admin** (can also manage users, departments, folders, categories, and view reports).
- Users log in with email + password; sessions refresh automatically.
- **Every document is visible to every authenticated user** — the archive is organization-wide by design. Only the original uploader or an admin can edit or delete a document.

### 7. Admin reports
- A **Reports** dashboard for admins with: total document count, OCR success rates, breakdown by type and by department, 30-day upload activity, and top uploaders.

### 8. Audit log
- Every meaningful action is logged: logins, uploads, edits, deletes, reprocessing, folder and department changes. Admins can review the full log at any time.

---

## New functionality being added (approval workflow + comments)

Driven by a business need: an uploaded document shouldn't automatically become part of the archive without a review step. Reviewers need a way to accept, reject, or send it back with notes, and to have written conversations about the content of each document.

### 1. Approval workflow before archive
- When a document is uploaded it enters a **Pending** state and is **not yet visible in the archive**. It doesn't appear in the main Documents list for other users, is not returned by search, and cannot be cited in AI Chat.
- The document is routed to the **managers of its department** (a new role, configurable by admins — departments can have one or more managers).
- Managers see incoming uploads in a new **Inbox** view and can take one of three actions:
  - **Approve** — the document enters the archive. It becomes visible to the whole organization and joins the searchable corpus.
  - **Reject** — the document is marked rejected with an optional reason. It never enters the archive.
  - **Request revision** — the document is sent back to the uploader with a required reason (e.g. *"missing page 3"*, *"please rescan, the last page is illegible"*). The uploader can then fix and **resubmit** the document, which re-enters the Pending queue.
- An **action bar** on each document in the list and on the document detail page surfaces the right buttons for the user's role: approvers see Approve / Reject / Request revision; the uploader sees Resubmit when a revision is requested.
- The archive and search therefore only contain approved documents — a clean, authoritative corpus.

### 2. Comments on documents
- Any user who can see a document (the uploader, the department managers reviewing it, or — once approved — anyone in the organization) can leave a **comment** on it.
- Every comment shows **who wrote it and when**. Comments can only be **deleted by their author** (admins can also remove comments if needed for moderation).
- Comments enable conversations on the document itself — clarifying questions, references to other documents, status notes — without needing a separate email thread.
- When the approver writes a rejection reason or a revision request, that reason is automatically captured as a comment too, so the full history of the review is visible in one place.

### 3. In-app notifications
- A **bell icon** appears in the top bar with an unread count. Users are notified when:
  - Someone leaves a comment on a document they uploaded (or one under their review).
  - A document they're responsible for reviewing is uploaded or resubmitted.
  - One of their uploads is approved, rejected, or sent back for revision.
- Clicking a notification takes the user straight to the relevant document (opening the Comments tab for comment notifications). Notifications can be marked read individually or all at once.

### 4. Department managers
- Admins can now assign **one or more managers** to each department from the **Admin → Departments** page.
- Managers act as approvers for anything uploaded under their department.
- A user can manage multiple departments; a department can have multiple managers (useful when one manager is on leave).

---

## Workflow example

1. Leyla, working in the Finance department, scans and uploads a new supplier contract. She tags it *Contract*, places it in the *Finance → 2026 → Contracts* folder, and notes the physical location on the shelf.
2. The document enters the archive as **Pending**. It's not visible yet to the rest of the organization.
3. Rashad, the Finance department manager, sees the document in his **Inbox** and receives a notification.
4. Rashad opens the document, reviews it, and leaves a comment: *"Looks good, but please attach the signed cover page — it's missing."* He clicks **Request revision**.
5. Leyla receives a notification, opens the document, re-scans including the cover page, re-uploads (replacing the file), and clicks **Resubmit**.
6. Rashad is re-notified, reviews the updated version, and clicks **Approve**.
7. The document is now part of the organization's archive. Everyone can find it in the Documents list, search for it, and Claude Chat can cite it in answers to questions like *"What supplier contracts did we sign in 2026?"*
8. Months later, during an internal audit, the auditor searches for the supplier's name in Chat, gets an answer with the contract cited as a source, opens it in one click, and sees both the document and the conversation that happened around it during review.

---

## On the roadmap (not yet built)

Three follow-up ideas were discussed and deliberately deferred — they'll be reconsidered once the approval + comments flow is in active use and we see what's actually needed.

- **Matrix-based access control.** Beyond the current Admin / User / Department-manager split, a finer-grained permission matrix (e.g. *"this user can comment but not approve"*, *"this user can only read Finance documents"*). Meaningful only once we see how the approval workflow is used in practice.
- **Customer-tailored archive IDs.** Today every document gets the ID pattern `DOC-000001`. A richer convention (e.g. `FIN-2026-CTR-001` combining department, year, type, sequence) could be introduced per customer. This requires agreeing on the format first and then a one-time setup; existing IDs would be kept as-is.
- **Downloadable management reports.** The current admin Reports page shows charts on-screen. A downloadable version (Excel or PDF) — for example, *documents per department this quarter* — is a small, standalone addition planned for a later iteration.
