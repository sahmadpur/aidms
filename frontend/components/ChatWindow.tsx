"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import ChatMessage from "./ChatMessage";
import type { Message } from "@/lib/useChat";

interface Props {
  messages: Message[];
  onSend: (content: string) => void;
  streaming: boolean;
}

/**
 * Letter-style transcript with a narrow centered column and minimal
 * composer. The container is constrained at the page level
 * (max-w-[760px]) so this component just lays out the transcript
 * and composer vertically inside whatever shell hosts it.
 */
export default function ChatWindow({ messages, onSend, streaming }: Props) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    onSend(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift + Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-8 space-y-7">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-center px-6">
            <div className="max-w-[40ch]">
              <p className="font-display text-[22px] leading-tight text-brand-deep">
                {t("placeholder")}
              </p>
              <p className="mt-2 text-[12px] text-ink-soft font-mono uppercase tracking-[0.18em]">
                {t("kbdHint")}
              </p>
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-edge-soft px-6 pt-3 pb-4"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            disabled={streaming}
            rows={1}
            className="flex-1 resize-none px-3 py-2 bg-transparent border border-edge-chip rounded-[6px] outline-none focus:border-edge-focus text-[14px] disabled:opacity-50 max-h-32 text-ink placeholder:text-ink-soft/70"
            style={{ minHeight: "40px" }}
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="p-2 text-ink-soft hover:text-brand disabled:opacity-30 disabled:hover:text-ink-soft transition-colors flex-shrink-0"
            aria-label="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[10.5px] text-ink-soft/70 font-mono uppercase tracking-[0.18em]">
          {t("kbdHint")}
        </p>
      </form>
    </div>
  );
}
