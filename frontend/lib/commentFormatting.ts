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
