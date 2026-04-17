"use client";

import { useState, useCallback } from "react";
import { createParser } from "eventsource-parser";
import { API_URL } from "./api";

export interface Citation {
  document_id: string;
  document_title: string;
  page_number: number;
  chunk_text: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export function useChat(initialSessionId: string | null = null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      setStreaming(true);
      setError(null);

      // Optimistically add user message and placeholder assistant message
      setMessages((prev) => [
        ...prev,
        { role: "user", content },
        { role: "assistant", content: "", citations: [] },
      ]);

      const token =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

      let response: Response;
      try {
        response = await fetch(`${API_URL}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ session_id: sessionId, content }),
        });
      } catch {
        setError("Network error. Please try again.");
        setStreaming(false);
        setMessages((prev) => prev.slice(0, -1)); // remove placeholder
        return;
      }

      if (!response.ok) {
        setError("Failed to send message.");
        setStreaming(false);
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      // Extract session ID from response header
      const newSessionId = response.headers.get("X-Session-Id");
      if (newSessionId && !sessionId) {
        setSessionId(newSessionId);
      }

      // Stream SSE response
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      const parser = createParser((event) => {
        if (event.type === "event" && event.data && event.data !== "[DONE]") {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "text_delta") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: updated[updated.length - 1].content + data.text,
                };
                return updated;
              });
            }

            if (data.type === "citations") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  citations: data.citations,
                };
                return updated;
              });
            }
          } catch {
            // Ignore parse errors on individual SSE events
          }
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
      } finally {
        setStreaming(false);
      }
    },
    [sessionId]
  );

  const loadMessages = useCallback((msgs: Message[]) => {
    setMessages(msgs);
  }, []);

  return { messages, sendMessage, streaming, sessionId, error, loadMessages };
}
