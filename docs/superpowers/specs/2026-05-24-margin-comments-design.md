# Word-Style Margin Comments — Design Spec

## Problem

The current document detail page shows comments in a **420px collapsible right rail** — a scrolling list disconnected from the PDF content. Users cannot see which comment relates to which text without clicking back and forth. The request is to redesign comments to work like Microsoft Word: positioned in the document margin next to the text they reference.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Layout approach | Shrink PDF + fixed right margin (240px) |
| General (non-annotated) comments | Collapsible discussion panel at page bottom |
| Comment creation | Instant bubble on text selection (Word-style) |
| Mobile/iPad fallback | Bottom sheet overlay on highlight tap |

---

## Layout

### Desktop (≥768px)

The document viewer area changes from a two-section flex layout (PDF + rail) to a single scroll container with an embedded margin:

```
┌─────────────────────────────────────────────────────┐
│ Toolbar: page nav │ zoom │ rotate │ OCR Text btn    │
├───────────────────────────────────┬──────────────────┤
│                                   │                  │
│         PDF Page                  │  Comment Margin  │
│     (fit-to-width minus 240px)    │    (240px)       │
│                                   │                  │
│   ┌──highlighted text──┐ --------→│ ┌──────────────┐ │
│   └────────────────────┘          │ │ Comment       │ │
│                                   │ │ bubble        │ │
│                                   │ └──────────────┘ │
│                                   │                  │
│   ┌──highlighted text──┐ --------→│ ┌──────────────┐ │
│   └────────────────────┘          │ │ Comment       │ │
│                                   │ │ bubble        │ │
│                                   │ └──────────────┘ │
│                                   │                  │
├───────────────────────────────────┴──────────────────┤
│ 💬 General Discussion (2)                    ▼ Expand│
└─────────────────────────────────────────────────────┘
```

- The PDF page and comment margin share **one scroll context** — they scroll together.
- The PDF `containerWidth` calculation subtracts 240px for the margin.
- The margin column is rendered alongside each PDF page, not as a separate scrolling panel.

### Mobile (<768px)

- The margin is **hidden**. PDF renders at full width.
- Highlight indicators (yellow underline) remain visible on the PDF.
- Tapping a highlight opens a **bottom sheet** overlay showing the comment bubble with replies and a reply input.
- Creating a new annotation: select text → bottom sheet opens with cursor focused in the comment input.

---

## Comment Bubble Design

Each annotation renders as a bubble in the margin, vertically positioned to align with its highlighted text.

### Bubble anatomy

```
┌─ 3px yellow accent bar ─────────────────────┐
│ [Avatar] Author Name              10:32 AM   │
│                                              │
│ Comment body text goes here, can be          │
│ multiple lines with markdown formatting.     │
│                                              │
│ ─── reply divider ───                        │
│ [Avatar] Replier Name             11:15 AM   │
│ Reply text here.                             │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Reply...                                 │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Styling

- Background: `#fffbeb` (warm yellow)
- Border: `1px solid #fde68a`
- Left accent: `3px solid #facc15`
- Border-radius: `6px`
- Shadow: `0 1px 4px rgba(0,0,0,0.06)`
- Font size: `11px` body, `9px` timestamps
- Avatar: 22px circle with initials or image (reuse existing `Avatar` component at `xs` size)

### States

| State | Visual |
|-------|--------|
| Default | Yellow background, standard shadow |
| Hover | Slightly deeper shadow |
| Active/focused | Elevated shadow, `ring-2 ring-yellow-400` |
| Resolved | Opacity 0.45, grey background (`#f9f9f9`), grey accent bar, "✓ Resolved" badge |

### Connector Lines

- Horizontal line from the right edge of the highlight to the left edge of the comment bubble.
- Color: `#facc15` (yellow) for active, `#ccc` for resolved.
- Width: 1.5px.
- Rendered as an SVG `<line>` element.
- When the comment bubble is pushed down (due to overlap avoidance), the connector angles: horizontal from highlight, then vertical down, then horizontal to bubble. Use an SVG `<path>` for the angled connector.

---

## Vertical Positioning & Overlap Avoidance

Comments are positioned to vertically align with their highlight. When multiple highlights are close together, bubbles stack:

1. Sort annotations by their highlight's Y position (top of first rect).
2. For each bubble, calculate its ideal Y position (aligned with the highlight).
3. If a bubble would overlap the previous bubble, push it down to `previousBubbleBottom + 8px` gap.
4. When a pushed-down bubble is clicked/focused, it gets a connector line that angles down from the highlight.

This matches Word's behavior — comments stack downward when they're too close, with angled connectors showing which text each refers to.

---

## Comment Creation Flow

### Text Selection → Instant Bubble

1. User selects text in the PDF text layer.
2. On `mouseup`, the system:
   - Captures the selection bounding rects (relative to page).
   - Creates a highlight overlay on the selected text.
   - Immediately creates an empty comment bubble in the margin at the corresponding Y position.
   - Focuses the cursor in the bubble's text input.
3. User types their comment and presses Enter (or clicks Send).
4. `POST /documents/{id}/annotations` creates the annotation + comment atomically.
5. On cancel (Escape or clicking away with empty input), the bubble and highlight are removed.

### Replying

- Each bubble has a "Reply..." input at the bottom.
- Clicking it expands the input and focuses it.
- Submitting calls `POST /documents/{id}/comments` with `parent_id` set to the root comment.
- The reply appears nested inside the same bubble.

### Resolving

- Hover on a bubble shows a checkmark icon button in the top-right corner.
- Clicking it calls `POST /documents/{id}/comments/{id}/resolve`.
- The bubble dims to resolved state (opacity 0.45, grey).
- A "Show resolved" toggle in the toolbar controls visibility.

---

## General Discussion Panel

For comments not attached to specific text (general document-level discussion):

- Collapsible panel at the bottom of the viewer, below the PDF page area.
- Header: `💬 General Discussion (count)` with expand/collapse toggle.
- When expanded, shows a standard threaded comment list with composer.
- Uses the existing comment infrastructure with `parent_id` for threading.
- Comments here have no annotation — they are created via the discussion panel's composer directly.

---

## OCR Text Panel

The OCR text panel moves from the rail tab to a **toolbar button**:

- Button labeled "OCR Text" in the viewer toolbar (right side).
- Clicking it opens a slide-over panel (from the right) or modal overlay.
- The panel shows the same OCR text content with search/find functionality.
- This is independent of the comment margin.

---

## Components

### New Components

| Component | Purpose |
|-----------|---------|
| `MarginComments.tsx` | Container that positions comment bubbles in the margin, handles overlap avoidance |
| `CommentBubble.tsx` | Single comment bubble with replies, reply input, resolve button |
| `ConnectorLine.tsx` | SVG connector from highlight to bubble (straight or angled) |
| `DiscussionPanel.tsx` | Collapsible bottom panel for general (non-annotated) comments |
| `CommentBottomSheet.tsx` | Mobile bottom sheet for viewing/creating comments |

### Modified Components

| Component | Changes |
|-----------|---------|
| `DocumentViewer.tsx` | Remove annotation layer overlay approach; integrate margin column alongside PDF page; handle instant bubble creation on text selection; remove floating "Add comment" button |
| `AnnotationLayer.tsx` | Simplified to only render highlight overlays on the PDF (no click handling for opening sidebar) |
| `AnnotationContext.tsx` | Add state for: creating bubble, focused bubble ID, show/hide resolved toggle |
| `documents/[id]/page.tsx` | Remove the entire rail system (420px sidebar, tab switching); add margin + discussion panel layout |

### Removed Components

| Component | Reason |
|-----------|--------|
| `CommentsPanel.tsx` (as sidebar) | Replaced by `MarginComments` + `DiscussionPanel`. The threading, markdown rendering, mention autocomplete, and avatar logic should be extracted into shared utilities and reused. |

---

## Data Model

No database changes needed. The existing `document_annotations` and `document_comments` tables with `comment_id` linkage support this design. The API endpoints remain the same:

- `GET /documents/{id}/annotations` — fetch all annotations
- `GET /documents/{id}/comments` — fetch all comments
- `POST /documents/{id}/annotations` — create annotation + comment
- `POST /documents/{id}/comments` — create comment (for replies and general discussion)
- `POST /documents/{id}/comments/{id}/resolve` / `unresolve`

---

## Reusable Logic from CommentsPanel

Extract from the current `CommentsPanel.tsx` into shared utilities:

| Logic | Extract to |
|-------|-----------|
| `renderBody()` (markdown + mentions) | `lib/commentFormatting.ts` |
| `renderMarkdownSegment()` | Same file |
| Mention autocomplete (query, pick, keyboard nav) | `hooks/useMentionAutocomplete.ts` |
| `buildThreads()` | `lib/commentThreads.ts` |
| `MENTION_SPLIT`, `MENTION_EXTRACT`, `MENTION_ID_RE` | `lib/commentFormatting.ts` |

---

## Interaction Details

### Clicking a highlight on the PDF
- Scrolls the margin to bring the corresponding bubble into view (if pushed down due to stacking).
- Sets the bubble as "active" — elevated shadow, ring highlight.
- The highlight on the PDF also brightens.

### Clicking a bubble in the margin
- Sets it as active (ring highlight, elevated).
- The corresponding highlight on the PDF brightens.
- If the highlight is on a different page, navigates to that page.

### Keyboard navigation
- Tab through bubbles in the margin.
- Enter on a focused bubble opens the reply input.
- Escape closes the reply input / dismisses a new empty bubble.

### Scrolling behavior
- The margin column and PDF page are in the same scroll container — they scroll together naturally.
- Per-page rendering: each page gets its own margin column segment. When paginating (single-page view), the margin shows only that page's comments.

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Page with no annotations | Margin column is empty (still takes 240px space) |
| Many annotations on one page | Bubbles stack downward with 8px gaps; margin extends vertically beyond page if needed |
| Very long comment/thread | Bubble expands vertically; other bubbles push down |
| Annotation on text near bottom of page | Bubble may extend below the PDF page boundary — this is fine, it scrolls naturally |
| PDF with rotation (90/270°) | Margin stays on the right side; highlight coordinates are already stored relative to page dimensions and scale correctly |
| Fullscreen mode | Margin is included in fullscreen layout |
