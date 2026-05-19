"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import type { Message } from "@/lib/useChat";

interface Props {
  message: Message;
  timestamp?: string;
}

/**
 * Letter-style transcript turn. User and assistant share the same ink
 * column — no bubbles, no robot iconography. Each turn carries a 2px
 * accent rule on the outside edge (right for user, left for assistant)
 * so the eye can still parse who's speaking without filled chrome.
 */
export default function ChatMessage({ message, timestamp }: Props) {
  const t = useTranslations("chat");
  const isUser = message.role === "user";
  const time = timestamp ?? "";
  const label = isUser ? t("transcript.youLabel") : t("transcript.archiveLabel");

  return (
    <div
      className={
        isUser
          ? "border-r-2 border-brand-accent pr-4 ml-12"
          : "border-l-2 border-edge-soft pl-4 mr-12"
      }
    >
      <div
        className={`flex items-baseline gap-2 ${
          isUser ? "justify-end" : "justify-start"
        }`}
      >
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-soft">
          {label}
        </span>
        {time && (
          <span className="font-mono text-[10.5px] text-ink-soft/70">·  {time}</span>
        )}
      </div>

      <div
        className={`mt-1 text-[14px] leading-[1.65] text-ink whitespace-pre-wrap ${
          isUser ? "text-right" : ""
        }`}
      >
        {message.content || (
          <span className="text-ink-soft animate-pulse">▋</span>
        )}
      </div>

      {!isUser && message.citations && message.citations.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] text-ink-soft">
          {message.citations.map((c, i) => (
            <li key={i}>
              <Link
                href={`/documents/${c.document_id}`}
                className="inline-flex items-baseline gap-1.5 hover:text-brand transition-colors group"
                title={c.document_title}
              >
                {c.document_display_id && (
                  <span className="font-mono text-[10.5px] text-brand-deep group-hover:text-brand">
                    {c.document_display_id}
                  </span>
                )}
                <span className="underline decoration-edge-chip group-hover:decoration-brand decoration-1 underline-offset-2">
                  {c.document_title}
                </span>
                <span className="text-ink-soft/70">p.{c.page_number}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
