"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Send, CornerDownLeft } from "lucide-react";
import ChatMessage from "./ChatMessage";
import type { Message } from "@/lib/useChat";

interface Props {
  messages: Message[];
  onSend: (content: string) => void;
  streaming: boolean;
}

type WelcomeStep = { title: string; body: string };

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  function pickExample(text: string) {
    setInput(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }

  const steps = (t.raw("welcome.steps") as WelcomeStep[]) ?? [];
  const examples = (t.raw("welcome.examples") as string[]) ?? [];
  const benefits = (t.raw("welcome.benefits") as string[]) ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-8 space-y-7">
        {messages.length === 0 && (
          <Welcome
            heading={t("welcome.heading")}
            subhead={t("welcome.subhead")}
            stepsLabel={t("welcome.stepsLabel")}
            tryLabel={t("welcome.tryLabel")}
            benefitsLabel={t("welcome.benefitsLabel")}
            steps={steps}
            examples={examples}
            benefits={benefits}
            onPickExample={pickExample}
          />
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
            ref={textareaRef}
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

/* ---------- Welcome / reading-room panel ---------- */

interface WelcomeProps {
  heading: string;
  subhead: string;
  stepsLabel: string;
  tryLabel: string;
  benefitsLabel: string;
  steps: WelcomeStep[];
  examples: string[];
  benefits: string[];
  onPickExample: (text: string) => void;
}

function Welcome({
  heading,
  subhead,
  stepsLabel,
  tryLabel,
  benefitsLabel,
  steps,
  examples,
  benefits,
  onPickExample,
}: WelcomeProps) {
  return (
    <div className="mx-auto max-w-[560px] py-2">
      <header className="text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand-accent">
          Reading Room · AI
        </p>
        <h2 className="mt-4 font-display text-[26px] leading-[1.15] text-brand-deep">
          {heading}
        </h2>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft max-w-[44ch] mx-auto">
          {subhead}
        </p>
      </header>

      <SectionRule label={stepsLabel} className="mt-10" />

      <ol className="mt-6 grid grid-cols-3 gap-px bg-edge-soft border border-edge-soft rounded-[3px] overflow-hidden">
        {steps.map((s, i) => (
          <li key={i} className="bg-surface-card px-4 py-5">
            <span className="font-mono text-[10px] tracking-[0.22em] text-brand-accent">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-2.5 font-display text-[14px] leading-tight text-brand-deep">
              {s.title}
            </h3>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-soft">
              {s.body}
            </p>
          </li>
        ))}
      </ol>

      <SectionRule label={tryLabel} className="mt-10" />

      <ul className="mt-5 space-y-2">
        {examples.map((q, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onPickExample(q)}
              className="group w-full flex items-start gap-3 text-left px-3.5 py-2.5 border border-edge-soft rounded-[3px] hover:border-brand-accent/60 hover:bg-surface-hover transition-colors"
            >
              <span className="font-mono text-[10px] mt-[3px] tracking-[0.22em] text-ink-soft/60 group-hover:text-brand-accent transition-colors">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-display italic text-[14px] leading-snug text-brand-deep flex-1 truncate">
                &ldquo;{q}&rdquo;
              </span>
              <CornerDownLeft
                className="w-3.5 h-3.5 mt-[3px] text-ink-soft/30 group-hover:text-brand-accent transition-colors flex-shrink-0"
                strokeWidth={1.5}
              />
            </button>
          </li>
        ))}
      </ul>

      <SectionRule label={benefitsLabel} className="mt-10" />

      <ul className="mt-5 space-y-2">
        {benefits.map((b, i) => (
          <li
            key={i}
            className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-ink-soft"
          >
            <span aria-hidden className="text-brand-accent mt-[1px] select-none">
              ·
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionRule({ label, className = "" }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="h-px flex-1 bg-edge-soft" />
      <span className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink-soft/70">
        {label}
      </span>
      <div className="h-px flex-1 bg-edge-soft" />
    </div>
  );
}
