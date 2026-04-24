"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { FileText } from "lucide-react";
import type { Message } from "@/lib/useChat";

interface Props {
  message: Message;
}

export default function ChatMessage({ message }: Props) {
  const t = useTranslations("chat");

  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-primary-600 text-white rounded-br-sm"
              : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
          }`}
        >
          {message.content || <span className="text-gray-400 animate-pulse">▋</span>}
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="mt-1 space-y-1">
            <p className="text-xs text-gray-400 font-medium px-1">{t("sources")}</p>
            {message.citations.map((c, i) => (
              <Link
                key={i}
                href={`/documents/${c.document_id}`}
                className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-surface-hover hover:border-brand/40 hover:text-brand transition-colors"
                title={c.document_title}
              >
                <FileText className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{c.document_title}</span>
                <span className="text-gray-400 flex-shrink-0">p. {c.page_number}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
