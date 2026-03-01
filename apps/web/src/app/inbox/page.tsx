"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AssignedMembership = {
  id: string;
  user: {
    id: string;
    name: string;
    email?: string;
  };
};

type Tag = {
  id: string;
  name: string;
};

type Note = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
};

type Conversation = {
  id: string;
  customerDisplay: string;
  lastMessageAt: string | null;
  channelProvider: "WHATSAPP" | "INSTAGRAM" | string;
  assignedMembership: AssignedMembership | null;
  tags: Tag[];
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

type OrganizationMember = {
  membershipId: string;
  name: string;
  role: "OWNER" | "AGENT" | string;
};

type AssignConversationResponse = {
  id: string;
  assignedMembership: AssignedMembership | null;
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

const UNASSIGNED_VALUE = "__UNASSIGNED__";

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

function toInitials(value: string) {
  const parts = value
    .split(" ")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "?";

  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export default function InboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  const applyConversationAssignment = useCallback(
    (conversationId: string, assignedMembership: AssignedMembership | null) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, assignedMembership } : conversation,
        ),
      );
    },
    [],
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

      setSelectedConversationId((current) =>
        current && data.some((conversation) => conversation.id === current) ? current : data[0].id,
      );
    } catch {
      setErrorMessage("API'ye ulaşılamıyor. Backend ayakta mı kontrol edin.");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [router]);

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/conversations/members", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Members fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as OrganizationMember[];
      setMembers(data);
    } catch {
      setErrorMessage("Atama listesi alınamadı.");
    } finally {
      setIsLoadingMembers(false);
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

  const fetchNotes = useCallback(async (conversationId: string) => {
    setIsLoadingNotes(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Notes fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Note[];
      setNotes(data);
    } catch {
      setErrorMessage("Notlar alınırken hata oluştu.");
    } finally {
      setIsLoadingNotes(false);
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
    void Promise.all([fetchConversations(), fetchMembers()]);
  }, [fetchConversations, fetchMembers, isCheckingSession, session]);

  useEffect(() => {
    if (!selectedConversationId) return;
    void fetchMessages(selectedConversationId);
    void fetchNotes(selectedConversationId);
  }, [fetchMessages, fetchNotes, selectedConversationId]);

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

  const updateConversationTags = useCallback(
    (conversationId: string, tags: Tag[]) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, tags } : conversation,
        ),
      );
    },
    [],
  );

  const handleAddTag = async () => {
    const name = tagInput.trim();
    if (!selectedConversationId || !name || isAddingTag) return;

    setIsAddingTag(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Add tag failed: ${response.status}`);
      }

      const newTag = (await response.json()) as Tag;
      const currentTags = selectedConversation?.tags ?? [];
      const alreadyExists = currentTags.some((t) => t.id === newTag.id);
      if (!alreadyExists) {
        updateConversationTags(selectedConversationId, [...currentTags, newTag]);
      }
      setTagInput("");
    } catch {
      setErrorMessage("Etiket eklenemedi.");
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!selectedConversationId) return;

    const currentTags = selectedConversation?.tags ?? [];
    updateConversationTags(
      selectedConversationId,
      currentTags.filter((t) => t.id !== tagId),
    );

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/tags/${tagId}`,
        { method: "DELETE" },
      );

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        updateConversationTags(selectedConversationId, currentTags);
        throw new Error(`Remove tag failed: ${response.status}`);
      }
    } catch {
      setErrorMessage("Etiket kaldırılamadı.");
    }
  };

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAddTag();
    }
  };

  const handleAddNote = async () => {
    const body = noteInput.trim();
    if (!selectedConversationId || !body || isAddingNote) return;

    setIsAddingNote(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Add note failed: ${response.status}`);
      }

      const newNote = (await response.json()) as Note;
      setNotes((current) => [...current, newNote]);
      setNoteInput("");
    } catch {
      setErrorMessage("Not eklenemedi.");
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleAssign = async (nextMembershipId: string | null) => {
    if (!selectedConversationId || !selectedConversation || isAssigning) {
      return;
    }

    const currentMembershipId = selectedConversation.assignedMembership?.id ?? null;
    if (currentMembershipId === nextMembershipId) {
      return;
    }

    const previousAssignment = selectedConversation.assignedMembership;
    const selectedMember =
      nextMembershipId === null
        ? null
        : members.find((member) => member.membershipId === nextMembershipId) ?? null;
    const optimisticAssignment: AssignedMembership | null =
      nextMembershipId === null
        ? null
        : {
            id: nextMembershipId,
            user: {
              id: previousAssignment?.user.id ?? `pending-${nextMembershipId}`,
              name: selectedMember?.name ?? previousAssignment?.user.name ?? "Atandı",
            },
          };

    setIsAssigning(true);
    setErrorMessage(null);
    applyConversationAssignment(selectedConversationId, optimisticAssignment);

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: nextMembershipId }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Assign failed: ${response.status}`);
      }

      const data = (await response.json()) as AssignConversationResponse;
      applyConversationAssignment(data.id, data.assignedMembership);
    } catch {
      applyConversationAssignment(selectedConversationId, previousAssignment);
      setErrorMessage("Konuşma ataması güncellenemedi.");
    } finally {
      setIsAssigning(false);
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
                      <div className="flex shrink-0 items-center gap-2">
                        {conversation.assignedMembership ? (
                          <span
                            title={conversation.assignedMembership.user.name}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                              selected ? "bg-slate-700 text-slate-100" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {toInitials(conversation.assignedMembership.user.name)}
                          </span>
                        ) : null}
                        <span
                          className={`text-xs ${selected ? "text-slate-200" : "text-slate-400"}`}
                        >
                          {formatTimestamp(conversation.lastMessageAt)}
                        </span>
                      </div>
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
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                Atama
                <select
                  value={selectedConversation?.assignedMembership?.id ?? UNASSIGNED_VALUE}
                  disabled={!selectedConversationId || isLoadingMembers || isAssigning}
                  onChange={(event) => {
                    const value = event.target.value;
                    void handleAssign(value === UNASSIGNED_VALUE ? null : value);
                  }}
                  className="h-9 min-w-[180px] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none focus:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value={UNASSIGNED_VALUE}>Atanmamış</option>
                  {members.map((member) => (
                    <option key={member.membershipId} value={member.membershipId}>
                      {member.name} ({member.role})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Çıkış
              </button>
            </div>
          </header>

          {selectedConversation ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-2">
              {selectedConversation.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {tag.name}
                  <button
                    type="button"
                    onClick={() => void handleRemoveTag(tag.id)}
                    className="ml-0.5 text-slate-400 hover:text-slate-700"
                    aria-label={`${tag.name} etiketini kaldır`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Etiket ekle..."
                disabled={isAddingTag}
                className="h-7 w-28 rounded border border-slate-200 px-2 text-xs outline-none focus:border-slate-400 disabled:bg-slate-50"
              />
            </div>
          ) : null}

          {selectedConversation ? (
            <div className="border-b border-slate-200 px-6 py-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-500 uppercase">Notlar</h3>
              </div>
              {isLoadingNotes ? (
                <p className="mt-2 text-xs text-slate-400">Yükleniyor...</p>
              ) : notes.length > 0 ? (
                <div className="mt-2 max-h-32 space-y-2 overflow-y-auto">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded border border-slate-100 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-xs text-slate-700">{note.body}</p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {note.author.name} &bull; {formatTimestamp(note.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={noteInput}
                  onChange={(event) => setNoteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleAddNote();
                    }
                  }}
                  placeholder="Not ekle..."
                  disabled={isAddingNote}
                  className="h-7 flex-1 rounded border border-slate-200 px-2 text-xs outline-none focus:border-slate-400 disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={!noteInput.trim() || isAddingNote}
                  className="h-7 rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isAddingNote ? "..." : "Ekle"}
                </button>
              </div>
            </div>
          ) : null}

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
