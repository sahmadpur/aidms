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
