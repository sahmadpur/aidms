"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { Plus, MessageSquare, Trash2, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useChat } from "@/lib/useChat";
import ChatWindow from "@/components/ChatWindow";
import { TopBar, TopBarTitle } from "@/components/TopBar";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ChatSessionPage() {
  const t = useTranslations("chat");
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const { messages, sendMessage, streaming, loadMessages } = useChat(sessionId);
  const { data: sessionData, isLoading } = useSWR(`/chat/sessions/${sessionId}`, fetcher);
  const { data: sessions, mutate: mutateSessions } = useSWR("/chat/sessions", fetcher);

  useEffect(() => {
    if (sessionData?.messages) {
      loadMessages(
        sessionData.messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          citations: m.source_chunks || [],
        }))
      );
    }
  }, [sessionData]); // eslint-disable-line

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("deleteSession"))) return;
    await api.delete(`/chat/sessions/${id}`);
    mutateSessions();
    if (id === sessionId) router.push("/chat");
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <>
      <TopBar>
        <TopBarTitle>{t("title")}</TopBarTitle>
      </TopBar>
      <div className="flex h-[calc(100vh-92px)] gap-3 px-[22px] py-4">
        <div className="w-56 flex-shrink-0 bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden flex flex-col">
          <div className="p-3 border-b border-edge-soft">
            <button
              onClick={() => router.push("/chat")}
              className="w-full flex items-center justify-center gap-2 text-sm py-1.5 bg-surface-chipActive text-[#3b6d11] rounded-[6px] hover:bg-[#dcebc4] font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("newChat")}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {sessions?.map((s: any) => (
              <button
                key={s.id}
                onClick={() => router.push(`/chat/${s.id}`)}
                className={`w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-[6px] group ${
                  s.id === sessionId ? "bg-surface-chipActive" : "hover:bg-surface-hover"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${s.id === sessionId ? "text-[#3b6d11]" : "text-gray-400"}`} />
                  <span className={`text-xs truncate ${s.id === sessionId ? "text-[#3b6d11] font-medium" : "text-gray-700"}`}>
                    {s.title}
                  </span>
                </div>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-surface-card border border-edge-soft rounded-[10px] overflow-hidden">
          <ChatWindow messages={messages} onSend={sendMessage} streaming={streaming} />
        </div>
      </div>
    </>
  );
}
