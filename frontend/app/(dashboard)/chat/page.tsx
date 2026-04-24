"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { useChat } from "@/lib/useChat";
import ChatWindow from "@/components/ChatWindow";
import { TopBar, TopBarTitle } from "@/components/TopBar";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function ChatPage() {
  const t = useTranslations("chat");
  const router = useRouter();
  const { messages, sendMessage, streaming, sessionId } = useChat();
  const { data: sessions, mutate } = useSWR("/chat/sessions", fetcher);

  // When the first message in this view creates a session, pull the new
  // entry into the sidebar. (Don't navigate mid-stream — it would unmount
  // the component and interrupt the SSE response.)
  useEffect(() => {
    if (!sessionId) return;
    mutate();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(t("deleteSession"))) return;
    await api.delete(`/chat/sessions/${id}`);
    mutate();
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
              onClick={() => router.refresh()}
              className="w-full flex items-center justify-center gap-2 text-sm py-1.5 bg-surface-chipActive text-[#3b6d11] rounded-[6px] hover:bg-[#dcebc4] font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("newChat")}
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {!sessions?.length && (
              <p className="text-xs text-gray-400 text-center py-4">{t("noSessions")}</p>
            )}
            {sessions?.map((s: any) => (
              <button
                key={s.id}
                onClick={() => router.push(`/chat/${s.id}`)}
                className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded-[6px] hover:bg-surface-hover group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-700 truncate">{s.title}</span>
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
