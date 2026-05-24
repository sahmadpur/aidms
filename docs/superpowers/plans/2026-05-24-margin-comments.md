# Word-Style Margin Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 420px collapsible right rail with Word-style margin comments positioned alongside highlighted text in the PDF viewer.

**Architecture:** Extract reusable logic (markdown rendering, mention autocomplete, thread building) from CommentsPanel into shared utilities. Build new margin comment components (CommentBubble, MarginComments, ConnectorLine, DiscussionPanel, CommentBottomSheet). Restructure the document detail page to render PDF + margin in a single scroll container, with a collapsible general discussion panel at the bottom. Mobile falls back to bottom sheets.

**Tech Stack:** Next.js 14 (React), Tailwind CSS, SWR, next-intl, lucide-react, react-pdf

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/lib/commentFormatting.ts` | Regex constants, `renderBody()`, `renderMarkdownSegment()`, `commentMentionsUser()`, `serializeMentions()` |
| `frontend/lib/commentThreads.ts` | `buildThreads()`, `CommentThread` type |
| `frontend/hooks/useMentionAutocomplete.ts` | Mention query state, keyboard nav, pick handler, directory SWR |
| `frontend/components/CommentBubble.tsx` | Single margin comment bubble with replies, inline reply input, resolve button |
| `frontend/components/MarginComments.tsx` | Positions bubbles in the margin column, handles overlap avoidance, connector line rendering |
| `frontend/components/DiscussionPanel.tsx` | Collapsible bottom panel for general (non-annotated) comments |
| `frontend/components/CommentBottomSheet.tsx` | Mobile bottom sheet for viewing/creating comments on highlight tap |

### Modified Files
| File | Changes |
|------|---------|
| `frontend/components/AnnotationContext.tsx` | Add `showResolved`, `setShowResolved`, `creatingBubble` state |
| `frontend/components/AnnotationLayer.tsx` | Remove click-to-sidebar logic; simplify to highlight-only rendering |
| `frontend/components/DocumentViewer.tsx` | Remove floating button; integrate margin column; instant bubble on selection; single scroll context |
| `frontend/app/(dashboard)/documents/[id]/page.tsx` | Remove rail system; add margin layout; add DiscussionPanel; move OCR to toolbar modal |
| `frontend/i18n/en.json`, `az.json`, `ru.json` | Add margin comment i18n keys |

### Removed (replaced)
| File | Reason |
|------|--------|
| `frontend/components/CommentsPanel.tsx` | Logic extracted to shared utils; UI replaced by MarginComments + DiscussionPanel + CommentBubble |

---

### Task 1: Extract Comment Formatting Utilities

**Files:**
- Create: `frontend/lib/commentFormatting.ts`
- Create: `frontend/lib/commentThreads.ts`

These utilities are currently embedded in CommentsPanel.tsx. Extract them verbatim so both the new margin components and the discussion panel can reuse them.

- [ ] **Step 1: Create `frontend/lib/commentFormatting.ts`**

```typescript
import React from "react";
import { AtSign } from "lucide-react";

const MENTION_TOKEN_SRC = "@\\[[^\\]]{1,80}\\]\\([0-9a-fA-F-]{36}\\)";
export const MENTION_SPLIT = new RegExp(`(${MENTION_TOKEN_SRC})`, "g");
export const MENTION_EXTRACT = new RegExp(
  `^@\\[([^\\]]{1,80})\\]\\([0-9a-fA-F-]{36}\\)$`
);
export const MENTION_ID_RE = new RegExp(
  `@\\[[^\\]]{1,80}\\]\\(([0-9a-fA-F-]{36})\\)`,
  "g"
);

const COMBINED =
  /(__(.+?)__)|(\*\*(.+?)\*\*)|(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)|(https?:\/\/[^\s<>)"]+)/g;

export function renderMarkdownSegment(
  text: string,
  keyPrefix: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = COMBINED.exec(text)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(
        React.createElement("span", { key: `${keyPrefix}-t-${lastIdx}` }, text.slice(lastIdx, match.index))
      );
    }
    if (match[1]) {
      nodes.push(React.createElement("u", { key: `${keyPrefix}-u-${match.index}` }, match[2]));
    } else if (match[3]) {
      nodes.push(React.createElement("strong", { key: `${keyPrefix}-b-${match.index}` }, match[4]));
    } else if (match[5]) {
      nodes.push(React.createElement("em", { key: `${keyPrefix}-i-${match.index}` }, match[5]));
    } else if (match[6]) {
      nodes.push(
        React.createElement(
          "a",
          {
            key: `${keyPrefix}-a-${match.index}`,
            href: match[6],
            target: "_blank",
            rel: "noopener noreferrer",
            className: "text-brand underline hover:text-brand-hover break-all",
          },
          match[6],
        )
      );
    }
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    nodes.push(
      React.createElement("span", { key: `${keyPrefix}-t-${lastIdx}` }, text.slice(lastIdx))
    );
  }
  return nodes.length > 0
    ? nodes
    : [React.createElement("span", { key: `${keyPrefix}-empty` }, text)];
}

export function renderBody(body: string): React.ReactNode {
  return body.split(MENTION_SPLIT).map((part, idx) => {
    const m = part.match(MENTION_EXTRACT);
    if (m) {
      return React.createElement(
        "span",
        {
          key: idx,
          className:
            "inline-flex items-center gap-0.5 align-baseline px-1.5 py-px rounded-[3px] bg-brand-pale text-brand-deep font-medium text-[12px] leading-[1.4]",
        },
        React.createElement(AtSign, { className: "w-3 h-3 -ml-0.5 opacity-70" }),
        m[1],
      );
    }
    return React.createElement("span", { key: idx }, renderMarkdownSegment(part, `md-${idx}`));
  });
}

export function commentMentionsUser(
  body: string,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  const ids = body.match(MENTION_ID_RE);
  if (!ids) return false;
  return ids.some((tok) => tok.includes(userId));
}

export function serializeMentions(
  displayText: string,
  pickedMentions: Array<{ name: string; id: string }>,
): string {
  let out = displayText;
  for (const m of pickedMentions) {
    const needle = `@${m.name}`;
    const idx = out.indexOf(needle);
    if (idx === -1) continue;
    const replacement = `@[${m.name}](${m.id})`;
    out = out.slice(0, idx) + replacement + out.slice(idx + needle.length);
  }
  return out;
}
```

- [ ] **Step 2: Create `frontend/lib/commentThreads.ts`**

```typescript
import type { Comment } from "@/lib/types";

export interface CommentThread {
  root: Comment;
  replies: Comment[];
}

export function buildThreads(comments: Comment[]): CommentThread[] {
  const repliesByParent = new Map<string, Comment[]>();
  const roots: Comment[] = [];

  for (const c of comments) {
    if (c.parent_id) {
      const existing = repliesByParent.get(c.parent_id) ?? [];
      existing.push(c);
      repliesByParent.set(c.parent_id, existing);
    } else {
      roots.push(c);
    }
  }

  return roots.map((root) => ({
    root,
    replies: repliesByParent.get(root.id) ?? [],
  }));
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/commentFormatting.ts frontend/lib/commentThreads.ts
git commit -m "refactor: extract comment formatting and threading into shared utilities"
```

---

### Task 2: Extract Mention Autocomplete Hook

**Files:**
- Create: `frontend/hooks/useMentionAutocomplete.ts`

- [ ] **Step 1: Create the hook**

```typescript
"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import api from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
}

interface PickedMention {
  name: string;
  id: string;
}

export function useMentionAutocomplete() {
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [pickedMentions, setPickedMentions] = useState<PickedMention[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: directoryUsers = [] } = useSWR<DirectoryUser[]>(
    mentionQuery !== null
      ? `/users/directory?q=${encodeURIComponent(mentionQuery)}`
      : null,
    fetcher,
  );

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret);
    const atIdx = before.lastIndexOf("@");
    if (atIdx === -1) {
      setMentionQuery(null);
      return;
    }
    const afterAt = before.slice(atIdx + 1);
    if (/\n/.test(afterAt)) {
      setMentionQuery(null);
      return;
    }
    const charBefore = atIdx > 0 ? before[atIdx - 1] : " ";
    if (!/[\s(]/.test(charBefore) && atIdx !== 0) {
      setMentionQuery(null);
      return;
    }
    setMentionQuery(afterAt);
    setMentionStart(atIdx);
    setHighlightIdx(0);
  }

  function pickMention(
    user: DirectoryUser,
    body: string,
    setBody: (v: string) => void,
  ) {
    const display = `@${user.full_name} `;
    const before = body.slice(0, mentionStart);
    const after = body.slice(
      mentionStart + 1 + (mentionQuery?.length ?? 0),
    );
    setBody(before + display + after);
    setPickedMentions((prev) => [
      ...prev,
      { name: user.full_name, id: user.id },
    ]);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = (before + display).length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleMentionKeyDown(
    e: React.KeyboardEvent,
    body: string,
    setBody: (v: string) => void,
  ): boolean {
    if (mentionQuery === null || directoryUsers.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, directoryUsers.length - 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      pickMention(directoryUsers[highlightIdx], body, setBody);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setMentionQuery(null);
      return true;
    }
    return false;
  }

  function resetMentions() {
    setPickedMentions([]);
    setMentionQuery(null);
  }

  return {
    textareaRef,
    mentionQuery,
    mentionStart,
    highlightIdx,
    setHighlightIdx,
    directoryUsers,
    pickedMentions,
    updateMentionState,
    pickMention,
    handleMentionKeyDown,
    resetMentions,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/hooks/useMentionAutocomplete.ts
git commit -m "refactor: extract mention autocomplete into reusable hook"
```

---

### Task 3: Update AnnotationContext

**Files:**
- Modify: `frontend/components/AnnotationContext.tsx`

Add `showResolved` toggle and `creatingBubble` state for the new margin layout.

- [ ] **Step 1: Update the context**

Add these fields to `AnnotationContextValue`:

```typescript
showResolved: boolean;
setShowResolved: (v: boolean) => void;
creatingBubble: { pageNumber: number; yPosition: number; rects: PendingAnnotation["highlightRects"]; selectedText: string } | null;
setCreatingBubble: (b: AnnotationContextValue["creatingBubble"]) => void;
```

Add the corresponding state in the provider:
```typescript
const [showResolved, setShowResolved] = useState(true);
const [creatingBubble, setCreatingBubble] = useState<AnnotationContextValue["creatingBubble"]>(null);
```

Include them in the context value object.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/AnnotationContext.tsx
git commit -m "feat: add showResolved and creatingBubble to annotation context"
```

---

### Task 4: Build CommentBubble Component

**Files:**
- Create: `frontend/components/CommentBubble.tsx`

This is the core visual unit — a single margin comment bubble with replies, inline reply input, and resolve/delete actions.

- [ ] **Step 1: Create `frontend/components/CommentBubble.tsx`**

The component receives a `CommentThread` (root + replies) and renders:
- Yellow bubble (`bg-[#fffbeb]`, `border border-[#fde68a]`, `border-l-[3px] border-l-[#facc15]`)
- Header: Avatar (xs) + author name + timestamp
- Body: rendered via `renderBody()` from `lib/commentFormatting`
- Replies: divider + nested items inside the same bubble
- Inline "Reply..." input at the bottom (expands on click to a textarea with Send button)
- Resolve button (top-right, visible on hover, top-level only)
- Resolved state: grey background (`bg-[#f9f9f9]`), grey accent, opacity-50, "Resolved" badge
- Delete button visible on hover for own comments / admin

Props interface:
```typescript
interface CommentBubbleProps {
  thread: CommentThread;
  documentId: string;
  isActive: boolean;
  onActivate: () => void;
  onMutate: () => void;
  className?: string;
}
```

The bubble uses `useMentionAutocomplete()` for the inline reply input. On submit, it calls `POST /documents/{documentId}/comments` with `parent_id: thread.root.id`. On resolve, it calls `POST /documents/{documentId}/comments/{id}/resolve`.

Use `useMe()` to determine own comments and admin status. Use `useTranslations()` for i18n. Use the `Avatar` component from `@/components/Avatar`.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/CommentBubble.tsx
git commit -m "feat: add CommentBubble component for margin comments"
```

---

### Task 5: Build MarginComments Component

**Files:**
- Create: `frontend/components/MarginComments.tsx`

This component positions CommentBubble instances in a 240px margin column alongside the PDF page. It handles vertical positioning and overlap avoidance.

- [ ] **Step 1: Create `frontend/components/MarginComments.tsx`**

Props:
```typescript
interface MarginCommentsProps {
  documentId: string;
  annotations: Annotation[];
  comments: Comment[];
  pageNumber: number;
  pageHeight: number;
  pageWidth: number;
}
```

Logic:
1. Filter annotations to current page.
2. For each annotation, find its linked comment thread (match `annotation.comment_id` to a root comment's `id`).
3. Sort by the Y position of the first highlight rect (scaled to current page dimensions).
4. Position each bubble at the ideal Y. If it would overlap the previous bubble, push it down to `prevBottom + 8px`.
5. Track each bubble's rendered height via a ref callback to recompute positions when content changes.
6. Render connector lines as SVG — straight horizontal when aligned, angled (L-shaped path) when pushed down.

The component also renders a "creating" bubble when `creatingBubble` is set in context (the instant bubble from text selection, with a focused textarea).

Use `useAnnotation()` for context state (activeAnnotationId, showResolved, creatingBubble).

Connector SVG: render an absolutely-positioned SVG overlay. For each annotation-bubble pair, draw a line from the highlight's right edge (at the highlight's vertical midpoint) to the bubble's left edge (at the bubble's vertical midpoint). Use `<line>` for straight connectors and `<path>` with `M x1,y1 L x1,y2 L x2,y2` for angled ones.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/MarginComments.tsx
git commit -m "feat: add MarginComments with positioning and connector lines"
```

---

### Task 6: Build DiscussionPanel Component

**Files:**
- Create: `frontend/components/DiscussionPanel.tsx`

Collapsible bottom panel for general (non-annotated) comments.

- [ ] **Step 1: Create `frontend/components/DiscussionPanel.tsx`**

Props:
```typescript
interface DiscussionPanelProps {
  documentId: string;
  comments: Comment[];
  onMutate: () => void;
}
```

Layout:
- Collapsed: header bar with `💬 General Discussion (count)` and expand toggle
- Expanded: threaded comment list + composer at the bottom
- Filter comments to those without an annotation (compare comment IDs against annotation comment_ids; any comment whose root is not in the annotations set is a "general" comment)
- Uses `buildThreads()` from `lib/commentThreads`
- Composer uses `useMentionAutocomplete()` hook
- Submit calls `POST /documents/{documentId}/comments` (no annotation, no parent_id for top-level)

Styling:
- Container: `bg-white border border-edge-soft rounded-b-[10px]`
- Header: `px-4 py-2 cursor-pointer flex justify-between` with count badge
- Expanded body: `max-h-[300px] overflow-y-auto px-4 py-3`

- [ ] **Step 2: Commit**

```bash
git add frontend/components/DiscussionPanel.tsx
git commit -m "feat: add DiscussionPanel for general document comments"
```

---

### Task 7: Build CommentBottomSheet Component

**Files:**
- Create: `frontend/components/CommentBottomSheet.tsx`

Mobile fallback for viewing/creating comments when the margin doesn't fit.

- [ ] **Step 1: Create `frontend/components/CommentBottomSheet.tsx`**

Props:
```typescript
interface CommentBottomSheetProps {
  documentId: string;
  thread: CommentThread | null;
  isCreating: boolean;
  onClose: () => void;
  onMutate: () => void;
}
```

Layout:
- Fixed overlay at bottom of viewport: `fixed inset-x-0 bottom-0 z-50`
- Backdrop: `fixed inset-0 bg-black/30`
- Sheet: `bg-white rounded-t-xl max-h-[70vh] overflow-y-auto`
- Drag handle at top (small grey pill)
- If `thread` is set: shows the comment bubble content (body, replies, reply input)
- If `isCreating`: shows a focused textarea for the new comment
- Close on backdrop click or swipe down

Uses the same `renderBody()`, `useMentionAutocomplete()`, and API calls as CommentBubble.

- [ ] **Step 2: Commit**

```bash
git add frontend/components/CommentBottomSheet.tsx
git commit -m "feat: add CommentBottomSheet for mobile annotation comments"
```

---

### Task 8: Restructure DocumentViewer for Margin Layout

**Files:**
- Modify: `frontend/components/DocumentViewer.tsx`
- Modify: `frontend/components/AnnotationLayer.tsx`

Major changes to DocumentViewer:
1. Remove the floating "Add comment" button and `floatingBtn` state
2. Subtract 240px from `containerWidth` for the margin (desktop only)
3. Render the PDF page and margin column side-by-side in a flex container inside the scroll area
4. On text selection (`mouseup`), instead of showing a floating button, immediately set `creatingBubble` in the annotation context
5. Pass `pageHeight` to MarginComments (measure from the rendered `<Page>` element)

- [ ] **Step 1: Update DocumentViewer.tsx**

Key changes in the scroll/page area (replacing the current lines 314-362):

```tsx
{/* PDF Page + Margin — single scroll context */}
<div ref={scrollRef} className="flex-1 overflow-auto p-4 flex justify-center">
  <Document file={blobUrl} onLoadSuccess={onDocumentLoadSuccess} loading={...}>
    <div className="flex gap-0 items-start">
      {/* PDF page */}
      <div ref={pageContainerRef} className="relative" onMouseUp={handleMouseUp}>
        <Page
          pageNumber={pageNumber}
          width={renderedWidth}
          rotate={rotation}
          className="shadow-lg"
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
        {documentId && pageAnnotations.length > 0 && (
          <AnnotationLayer
            annotations={pageAnnotations}
            pageWidth={pageContainerRef.current?.offsetWidth ?? renderedWidth}
            pageHeight={pageContainerRef.current?.offsetHeight ?? 0}
            onAnnotationClick={handleAnnotationClick}
            activeAnnotationId={annotationCtx?.activeAnnotationId}
          />
        )}
      </div>
      {/* Comment margin (desktop only) */}
      {documentId && !isMobile && (
        <MarginComments
          documentId={documentId}
          annotations={annotations}
          comments={comments}
          pageNumber={pageNumber}
          pageHeight={pageContainerRef.current?.offsetHeight ?? 0}
          pageWidth={pageContainerRef.current?.offsetWidth ?? renderedWidth}
        />
      )}
    </div>
  </Document>
</div>
```

The `containerWidth` calculation changes to subtract margin width on desktop:
```typescript
const MARGIN_WIDTH = 240;
const marginOffset = documentId && !isMobile ? MARGIN_WIDTH : 0;
// In the resize observer:
const w = el.clientWidth - SCROLL_PADDING - marginOffset;
```

Use `window.matchMedia("(max-width: 768px)")` for `isMobile` state (same pattern as DataTable).

The `handleMouseUp` changes: instead of setting `floatingBtn`, it sets `creatingBubble` in the annotation context immediately with the Y position and highlight rects. Remove the `floatingBtn` state, `FloatingBtn` interface, and the floating button JSX entirely.

DocumentViewer now also needs to fetch comments (via SWR) to pass to MarginComments. Add:
```typescript
const { data: comments = [], mutate: mutateComments } = useSWR<Comment[]>(
  documentId ? `/documents/${documentId}/comments` : null,
  fetcher,
);
```

- [ ] **Step 2: Simplify AnnotationLayer.tsx**

Remove the `onAnnotationClick` prop. Highlights remain as visual indicators only — clicking a highlight now sets `activeAnnotationId` in context, which MarginComments listens to for scrolling/focusing the bubble. Keep the highlight rendering logic unchanged. Add an `onClick` that sets `activeAnnotationId` via the context (accessed with `useAnnotationOptional()`).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/DocumentViewer.tsx frontend/components/AnnotationLayer.tsx
git commit -m "feat: restructure DocumentViewer for margin comments layout"
```

---

### Task 9: Restructure Document Detail Page

**Files:**
- Modify: `frontend/app/(dashboard)/documents/[id]/page.tsx`

Remove the entire rail system and replace with the margin-integrated layout.

- [ ] **Step 1: Remove the rail**

Delete these pieces:
- `railTab` and `railMode` state
- The `RailTab` component and tab switching JSX
- The expanded rail section (w-[420px] aside with CommentsPanel)
- The collapsed rail section (w-[64px] pill layout)
- The pending annotation banner (this is now handled by the creating bubble in the margin)
- The `CommentsPanel` import

- [ ] **Step 2: Add DiscussionPanel and OCR modal**

Replace the two-section flex layout with:

```tsx
<div className="flex-1 flex flex-col gap-0 min-h-[520px]">
  {/* Document viewer with integrated margin */}
  <div className="flex-1 bg-surface-card border border-edge-soft rounded-t-[10px] overflow-hidden">
    <DocumentViewer fileUrl={fileUrl} documentId={id} />
  </div>
  {/* General discussion panel */}
  <DiscussionPanel
    documentId={id}
    comments={comments}
    onMutate={() => mutate()}
  />
</div>
```

The OCR text panel becomes a modal triggered from the toolbar. Add state:
```typescript
const [ocrModalOpen, setOcrModalOpen] = useState(false);
```

Pass `onOcrClick={() => setOcrModalOpen(true)}` as a prop to DocumentViewer, which renders the "OCR Text" button in its toolbar. When clicked, open a slide-over modal containing the existing `OCRTextPanel` component.

- [ ] **Step 3: Add mobile bottom sheet integration**

Import `CommentBottomSheet`. When `isMobile` and `activeAnnotationId` is set in context, render the bottom sheet with the corresponding thread. When creating on mobile, render the bottom sheet with `isCreating: true`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(dashboard\)/documents/\[id\]/page.tsx
git commit -m "feat: replace rail with margin comments and discussion panel"
```

---

### Task 10: Add i18n Keys

**Files:**
- Modify: `frontend/i18n/en.json`
- Modify: `frontend/i18n/az.json`
- Modify: `frontend/i18n/ru.json`

- [ ] **Step 1: Add keys to all three locale files**

Under a `"margin"` section:

**English:**
```json
"margin": {
  "reply": "Reply...",
  "resolved": "Resolved",
  "resolve": "Resolve",
  "unresolve": "Reopen",
  "showResolved": "Show resolved",
  "hideResolved": "Hide resolved",
  "generalDiscussion": "General Discussion",
  "expand": "Expand",
  "collapse": "Collapse",
  "newComment": "Add your comment...",
  "ocrText": "OCR Text"
}
```

**Azerbaijani:**
```json
"margin": {
  "reply": "Cavab...",
  "resolved": "Həll edildi",
  "resolve": "Həll et",
  "unresolve": "Yenidən aç",
  "showResolved": "Həll edilənləri göstər",
  "hideResolved": "Həll edilənləri gizlət",
  "generalDiscussion": "Ümumi müzakirə",
  "expand": "Aç",
  "collapse": "Yığ",
  "newComment": "Şərhinizi yazın...",
  "ocrText": "OCR mətni"
}
```

**Russian:**
```json
"margin": {
  "reply": "Ответить...",
  "resolved": "Решено",
  "resolve": "Решить",
  "unresolve": "Открыть заново",
  "showResolved": "Показать решённые",
  "hideResolved": "Скрыть решённые",
  "generalDiscussion": "Общее обсуждение",
  "expand": "Развернуть",
  "collapse": "Свернуть",
  "newComment": "Добавьте комментарий...",
  "ocrText": "Текст OCR"
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/i18n/en.json frontend/i18n/az.json frontend/i18n/ru.json
git commit -m "feat: add i18n keys for margin comments"
```

---

### Task 11: Delete CommentsPanel and Clean Up Imports

**Files:**
- Delete: `frontend/components/CommentsPanel.tsx`
- Modify: any files that import CommentsPanel

- [ ] **Step 1: Find all imports of CommentsPanel**

```bash
grep -rn "CommentsPanel" frontend/ --include="*.tsx" --include="*.ts"
```

Expected: `documents/[id]/page.tsx` (already updated in Task 9 to remove this import).

- [ ] **Step 2: Delete CommentsPanel.tsx**

```bash
rm frontend/components/CommentsPanel.tsx
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx next build
```

Expected: Build succeeds with no import errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove CommentsPanel, replaced by margin comments"
```

---

### Task 12: Build, Deploy, and Verify

- [ ] **Step 1: Build and deploy**

```bash
docker compose up -d --build api worker frontend
```

- [ ] **Step 2: Verify in browser**

Open a document with existing comments at `http://localhost:3000/documents/{id}`.

Check:
1. Comments appear in the right margin next to highlighted text
2. Connector lines link highlights to bubbles
3. Selecting text instantly creates an empty bubble with focused input
4. Typing and pressing Enter/Send creates the annotation
5. Pressing Escape dismisses the creating bubble
6. Reply input inside bubbles works
7. Resolve/unresolve works (dimming, badge)
8. General Discussion panel at bottom expands/collapses
9. OCR Text button in toolbar opens the text panel
10. Resize browser to mobile width — margin disappears, tapping highlights opens bottom sheet

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: margin comments polish after testing"
```
