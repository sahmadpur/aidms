/**
 * Split a string into alternating plain / match segments based on a
 * case-insensitive needle. Returns an array of segments that the caller
 * can render with arbitrary highlight chrome around `match: true` runs.
 *
 * Lifted from OCRTextPanel; reused by the dictionary search highlight.
 */
export type HighlightSegment = { text: string; match: boolean };

export function buildSegments(
  body: string,
  needle: string,
): HighlightSegment[] {
  const q = needle.trim();
  if (!q) return [{ text: body, match: false }];

  const segments: HighlightSegment[] = [];
  const lower = body.toLowerCase();
  const needleLower = q.toLowerCase();
  let cursor = 0;
  while (cursor < body.length) {
    const idx = lower.indexOf(needleLower, cursor);
    if (idx === -1) {
      segments.push({ text: body.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      segments.push({ text: body.slice(cursor, idx), match: false });
    }
    segments.push({ text: body.slice(idx, idx + q.length), match: true });
    cursor = idx + q.length;
  }
  return segments;
}
