"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Send, Loader2 } from "lucide-react";
import ChatMessage from "./ChatMessage";
import type { Message } from "@/lib/useChat";

interface Props {
  messages: Message[];
  onSend: (content: string) => void;
  streaming: boolean;
}

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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm text-center">{t("placeholder")}</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}
        {streaming && messages[messages.length - 1]?.role === "assistant" &&
          !messages[messages.length - 1]?.content && (
            <div className="flex justify-start">
              <div className="bg-surface-card border border-edge-soft rounded-2xl rounded-bl-sm px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            </div>
          )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-edge-soft bg-surface-card p-3 flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          disabled={streaming}
          rows={1}
          className="flex-1 resize-none px-3 py-2 border border-edge-chip rounded-[6px] bg-surface-hover outline-none focus:border-edge-focus focus:bg-white text-sm disabled:opacity-50 max-h-32"
          style={{ minHeight: "40px" }}
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="p-2 bg-brand text-brand-pale rounded-[6px] hover:bg-brand-hover disabled:opacity-50 flex-shrink-0"
        >
          {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}
