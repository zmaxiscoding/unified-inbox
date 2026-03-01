"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Conversation = {
  id: string;
  customerDisplay: string;
  lastMessageAt: string | null;
  channelProvider: "WHATSAPP" | "INSTAGRAM" | string;
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND" | string;
  text: string;
  createdAt: string;
  senderDisplay: string | null;
};

type SessionInfo = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

function formatTimestamp(value: string | null) {
  if (!value) return "-";

  const parsed = new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export default function InboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/conversations", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Conversations fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Conversation[];
      setConversations(data);

      if (data.length === 0) {
        setSelectedConversationId(null);
        setMessages([]);
        return;
      }

      setSelectedConversationId((current) => current ?? data[0].id);
    } catch {
      setErrorMessage("API'ye ulaşılamıyor. Backend ayakta mı kontrol edin.");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [router]);

  const fetchSession = useCallback(async () => {
    setIsCheckingSession(true);
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Session fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as SessionInfo;
      setSession(data);
    } catch {
      setErrorMessage("Oturum doğrulanamadı.");
    } finally {
      setIsCheckingSession(false);
    }
  }, [router]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Messages fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Message[];
      setMessages(data);
    } catch {
      setErrorMessage("Mesajlar alınırken hata oluştu.");
    } finally {
      setIsLoadingMessages(false);
    }
  }, [router]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (isCheckingSession || !session) return;
    void fetchConversations();
  }, [fetchConversations, isCheckingSession, session]);

  useEffect(() => {
    if (!selectedConversationId) return;
    void fetchMessages(selectedConversationId);
  }, [fetchMessages, selectedConversationId]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedConversationId || !draft.trim()) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Message create failed: ${response.status}`);
      }

      setDraft("");
      await fetchMessages(selectedConversationId);
      await fetchConversations();
    } catch {
      setErrorMessage("Mesaj gönderilemedi.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-3rem)] md:flex-row">
        <aside className="h-[42%] w-full border-b border-slate-200 md:h-auto md:w-[360px] md:border-r md:border-b-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h1 className="text-lg font-semibold text-slate-900">Unified Inbox</h1>
            <p className="text-sm text-slate-500">
              {session ? session.organization.name : "Konuşmalar"}
            </p>
          </div>

          <div className="h-[calc(100%-73px)] overflow-y-auto">
            {isLoadingConversations ? (
              <p className="px-5 py-4 text-sm text-slate-500">Yükleniyor...</p>
            ) : conversations.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Henüz konuşma yok.</p>
            ) : (
              conversations.map((conversation) => {
                const selected = conversation.id === selectedConversationId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className={`w-full border-b border-slate-100 px-5 py-4 text-left transition ${
                      selected ? "bg-slate-900 text-white" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{conversation.customerDisplay}</p>
                      <span
                        className={`shrink-0 text-xs ${
                          selected ? "text-slate-200" : "text-slate-400"
                        }`}
                      >
                        {formatTimestamp(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-1 text-xs ${
                        selected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {CHANNEL_LABELS[conversation.channelProvider] ?? conversation.channelProvider}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <p className="text-sm text-slate-500">Seçili Konuşma</p>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedConversation?.customerDisplay ?? "Konuşma seçin"}
              </h2>
              {session ? (
                <p className="text-xs text-slate-500">
                  {session.user.name} ({session.user.email})
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Çıkış
            </button>
          </header>

          {errorMessage ? (
            <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
            {isCheckingSession ? (
              <p className="text-sm text-slate-500">Oturum kontrol ediliyor...</p>
            ) : !selectedConversationId ? (
              <p className="text-sm text-slate-500">Mesajları görmek için soldan konuşma seçin.</p>
            ) : isLoadingMessages ? (
              <p className="text-sm text-slate-500">Mesajlar yükleniyor...</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-slate-500">Bu konuşmada henüz mesaj yok.</p>
            ) : (
              messages.map((message) => {
                const outbound = message.direction === "OUTBOUND";
                return (
                  <div
                    key={message.id}
                    className={`max-w-[80%] rounded-xl px-4 py-3 ${
                      outbound
                        ? "ml-auto bg-slate-900 text-white"
                        : "mr-auto border border-slate-200 bg-slate-50 text-slate-900"
                    }`}
                  >
                    <p className="text-sm">{message.text}</p>
                    <p className={`mt-2 text-xs ${outbound ? "text-slate-300" : "text-slate-500"}`}>
                      {(message.senderDisplay ?? "Bilinmiyor")} • {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={handleSend} className="border-t border-slate-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Mesaj yaz..."
                className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                disabled={!selectedConversationId || isSending}
              />
              <button
                type="submit"
                disabled={!selectedConversationId || !draft.trim() || isSending}
                className="h-11 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSending ? "Gönderiliyor..." : "Gönder"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
