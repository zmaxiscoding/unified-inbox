"use client";

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  status: "OPEN" | "RESOLVED" | string;
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
    emailVerifiedAt?: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

type AuthLinkRequestResponse = {
  ok: boolean;
  deliveryMode?: "outbox" | "disabled";
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

type UpdateConversationStatusResponse = {
  id: string;
  status: "OPEN" | "RESOLVED" | string;
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

const UNASSIGNED_VALUE = "__UNASSIGNED__";
const ENABLE_DEV_ENDPOINTS = process.env.NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS === "true";

function statusLabel(status: string) {
  if (status === "RESOLVED") return "Resolved";
  if (status === "OPEN") return "Open";
  return status;
}

function statusBadgeClass(status: string, selected: boolean) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";

  if (status === "RESOLVED") {
    return `${base} ${
      selected
        ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
        : "border-emerald-200 bg-emerald-50 text-emerald-700"
    }`;
  }

  return `${base} ${
    selected
      ? "border-sky-300 bg-sky-500/20 text-sky-100"
      : "border-sky-200 bg-sky-50 text-sky-700"
  }`;
}

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
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] = useState(false);
  const [sseStatus, setSseStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterTagId, setFilterTagId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [simulateCustomerDisplay, setSimulateCustomerDisplay] = useState("");
  const [simulateText, setSimulateText] = useState("");
  const [isSimulatingInbound, setIsSimulatingInbound] = useState(false);
  const [simulateInboundMessage, setSimulateInboundMessage] = useState<string | null>(null);

  const activeConversationRef = useRef<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, string>();
    for (const c of conversations) {
      for (const t of c.tags) {
        tagMap.set(t.id, t.name);
      }
    }
    return Array.from(tagMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [conversations]);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        setSearchTerm(value.trim());
      }, 400);
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilterStatus("");
    setFilterChannel("");
    setFilterAssignee("");
    setFilterTagId("");
    setSearchInput("");
    setSearchTerm("");
  }, []);

  const hasActiveFilters = filterStatus || filterChannel || filterAssignee || filterTagId || searchTerm;

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

  const applyConversationStatus = useCallback(
    (conversationId: string, status: Conversation["status"]) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, status } : conversation,
        ),
      );
    },
    [],
  );

  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterChannel) params.set("channel", filterChannel);
      if (filterAssignee) params.set("assigneeId", filterAssignee);
      if (filterTagId) params.set("tagId", filterTagId);
      if (searchTerm) params.set("search", searchTerm);
      const qs = params.toString();
      const response = await fetch(`/api/conversations${qs ? `?${qs}` : ""}`, { cache: "no-store" });
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
  }, [router, filterStatus, filterChannel, filterAssignee, filterTagId, searchTerm]);

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

  const resendVerificationEmail = useCallback(async () => {
    if (!session || isSendingVerificationEmail) return;

    setIsSendingVerificationEmail(true);
    setVerificationMessage(null);

    try {
      const response = await fetch("/api/auth/email-verification/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Verification request failed: ${response.status}`);
      }

      const body = (await response.json().catch(() => null)) as
        | AuthLinkRequestResponse
        | null;

      if (body?.deliveryMode === "disabled") {
        setVerificationMessage(
          "Bu ortamda e-posta gönderimi kapalı. Doğrulama linki otomatik gönderilemiyor.",
        );
      } else {
        setVerificationMessage(
          "Doğrulama linki hazırlandı. Outbox preview dosyasını kontrol edin.",
        );
      }
    } catch {
      setVerificationMessage("Doğrulama linki şu anda gönderilemedi.");
    } finally {
      setIsSendingVerificationEmail(false);
    }
  }, [isSendingVerificationEmail, router, session]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setIsLoadingMessages(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        cache: "no-store",
      });
      if (activeConversationRef.current !== conversationId) return;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Messages fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Message[];
      if (activeConversationRef.current !== conversationId) return;
      setMessages(data);
    } catch {
      if (activeConversationRef.current === conversationId) {
        setErrorMessage("Mesajlar alınırken hata oluştu.");
      }
    } finally {
      if (activeConversationRef.current === conversationId) {
        setIsLoadingMessages(false);
      }
    }
  }, [router]);

  const fetchNotes = useCallback(async (conversationId: string) => {
    setIsLoadingNotes(true);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        cache: "no-store",
      });
      if (activeConversationRef.current !== conversationId) return;
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Notes fetch failed: ${response.status}`);
      }

      const data = (await response.json()) as Note[];
      if (activeConversationRef.current !== conversationId) return;
      setNotes(data);
    } catch {
      if (activeConversationRef.current === conversationId) {
        setErrorMessage("Notlar alınırken hata oluştu.");
      }
    } finally {
      if (activeConversationRef.current === conversationId) {
        setIsLoadingNotes(false);
      }
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
    activeConversationRef.current = selectedConversationId;
    if (!selectedConversationId) {
      setMessages([]);
      setNotes([]);
      setNoteInput("");
      setIsLoadingMessages(false);
      setIsLoadingNotes(false);
      return;
    }
    setMessages([]);
    setNotes([]);
    setNoteInput("");
    void fetchMessages(selectedConversationId);
    void fetchNotes(selectedConversationId);
  }, [fetchMessages, fetchNotes, selectedConversationId]);

  // SSE realtime connection
  useEffect(() => {
    if (isCheckingSession || !session) return;

    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      setSseStatus("connecting");
      es = new EventSource("/api/events/stream");

      es.onopen = () => {
        if (!disposed) setSseStatus("connected");
      };

      es.addEventListener("message.created", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            conversationId: string;
            payload: Record<string, unknown>;
          };
          const currentId = activeConversationRef.current;
          if (currentId === data.conversationId) {
            void fetchMessages(currentId);
          }
          void fetchConversations();
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener("conversation.updated", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as {
            conversationId: string;
            payload: { action: string };
          };
          void fetchConversations();
          const currentId = activeConversationRef.current;
          if (currentId === data.conversationId) {
            void fetchMessages(currentId);
            if (data.payload.action === "tagAdded" || data.payload.action === "tagRemoved") {
              // conversation list fetch already handles tags
            }
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener("note.created", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data) as { conversationId: string };
          const currentId = activeConversationRef.current;
          if (currentId === data.conversationId) {
            void fetchNotes(currentId);
          }
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        if (disposed) return;
        setSseStatus("disconnected");
        es?.close();
        es = null;
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      es?.close();
      setSseStatus("disconnected");
    };
  }, [isCheckingSession, session, fetchConversations, fetchMessages, fetchNotes]);

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

  const handleSimulateInbound = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!ENABLE_DEV_ENDPOINTS || isSimulatingInbound) return;

    const text = simulateText.trim();
    const customerDisplay = simulateCustomerDisplay.trim();
    if (!text) return;

    setIsSimulatingInbound(true);
    setSimulateInboundMessage(null);

    try {
      const payload: { text: string; customerDisplay?: string } = { text };
      if (customerDisplay) {
        payload.customerDisplay = customerDisplay;
      }

      const response = await fetch("/api/dev/simulate-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setSimulateInboundMessage(`Simulate inbound başarısız (${response.status}).`);
        return;
      }

      setSimulateText("");
      setSimulateInboundMessage("Inbound mesaj simüle edildi.");
      await fetchConversations();
      const currentConversationId = activeConversationRef.current;
      if (currentConversationId) {
        await fetchMessages(currentConversationId);
      }
    } catch {
      setSimulateInboundMessage("Simulate inbound başarısız (network).");
    } finally {
      setIsSimulatingInbound(false);
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
    const conversationId = selectedConversationId;
    if (!conversationId || !body || isAddingNote) return;

    setIsAddingNote(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
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
      if (activeConversationRef.current === conversationId) {
        setNotes((current) => [...current, newNote]);
      }
      setNoteInput("");
    } catch {
      if (activeConversationRef.current === conversationId) {
        setErrorMessage("Not eklenemedi.");
      }
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

  const handleToggleStatus = async () => {
    if (!selectedConversationId || !selectedConversation || isUpdatingStatus) {
      return;
    }

    const previousStatus = selectedConversation.status;
    const nextStatus: "OPEN" | "RESOLVED" =
      previousStatus === "RESOLVED" ? "OPEN" : "RESOLVED";

    setIsUpdatingStatus(true);
    setErrorMessage(null);
    applyConversationStatus(selectedConversationId, nextStatus);

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (response.status === 401) {
        applyConversationStatus(selectedConversationId, previousStatus);
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Status update failed: ${response.status}`);
      }

      const data = (await response.json()) as UpdateConversationStatusResponse;
      applyConversationStatus(data.id, data.status);
    } catch {
      applyConversationStatus(selectedConversationId, previousStatus);
      setErrorMessage("Konuşma durumu güncellenemedi.");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-6">
      {session && !session.user.emailVerifiedAt ? (
        <section className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              Soft verification rollout
            </p>
            <p className="text-sm font-medium text-amber-900">
              E-posta doğrulaması henüz tamamlanmadı
            </p>
            <p className="text-xs text-amber-800">
              Bu sprintte enforcement açık değil; isterseniz doğrulama linkini yeniden gönderebilirsiniz.
            </p>
            {verificationMessage ? (
              <p className="mt-1 text-xs text-amber-800">{verificationMessage}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => void resendVerificationEmail()}
            disabled={isSendingVerificationEmail}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSendingVerificationEmail
              ? "Gönderiliyor..."
              : "Doğrulama Linki Gönder"}
          </button>
        </section>
      ) : null}

      {ENABLE_DEV_ENDPOINTS ? (
        <section className="mx-auto mb-3 w-full max-w-6xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Dev only</p>
          <p className="text-sm font-medium text-amber-900">Simulate inbound</p>
          <form
            onSubmit={handleSimulateInbound}
            className="mt-2 flex flex-col gap-2 md:flex-row md:items-center"
          >
            <input
              type="text"
              value={simulateCustomerDisplay}
              onChange={(event) => setSimulateCustomerDisplay(event.target.value)}
              placeholder="customerDisplay (optional)"
              className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 md:w-64"
              disabled={isSimulatingInbound}
            />
            <input
              type="text"
              value={simulateText}
              onChange={(event) => setSimulateText(event.target.value)}
              placeholder="text (required)"
              required
              className="h-9 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
              disabled={isSimulatingInbound}
            />
            <button
              type="submit"
              disabled={!simulateText.trim() || isSimulatingInbound}
              className="h-9 rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {isSimulatingInbound ? "Sending..." : "Send"}
            </button>
          </form>
          {simulateInboundMessage ? (
            <p className="mt-2 text-xs text-amber-800">{simulateInboundMessage}</p>
          ) : null}
        </section>
      ) : null}
      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-3rem)] md:flex-row">
        <aside className="flex h-[42%] w-full flex-col border-b border-slate-200 md:h-auto md:w-[360px] md:border-r md:border-b-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-slate-900">Unified Inbox</h1>
              <span
                title={sseStatus === "connected" ? "Realtime connected" : sseStatus === "connecting" ? "Connecting..." : "Disconnected"}
                className={`inline-block h-2 w-2 rounded-full ${
                  sseStatus === "connected"
                    ? "bg-emerald-500"
                    : sseStatus === "connecting"
                      ? "bg-amber-400 animate-pulse"
                      : "bg-slate-300"
                }`}
              />
            </div>
            <p className="text-sm text-slate-500">
              {session ? session.organization.name : "Konuşmalar"}
            </p>
          </div>

          <div className="border-b border-slate-200 px-4 py-3 space-y-2">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="Ara (müşteri / mesaj)..."
              className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-slate-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Tüm Durumlar</option>
                <option value="OPEN">Open</option>
                <option value="RESOLVED">Resolved</option>
              </select>
              <select
                value={filterChannel}
                onChange={(e) => setFilterChannel(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Tüm Kanallar</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
              </select>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Tüm Atamalar</option>
                {members.map((m) => (
                  <option key={m.membershipId} value={m.membershipId}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={filterTagId}
                onChange={(e) => setFilterTagId(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">Tüm Etiketler</option>
                {allTags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
              >
                Filtreleri temizle
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
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
                    <div className="mt-2">
                      <span className={statusBadgeClass(conversation.status, selected)}>
                        {statusLabel(conversation.status)}
                      </span>
                    </div>
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
              {selectedConversation ? (
                <div className="mt-1">
                  <span className={statusBadgeClass(selectedConversation.status, false)}>
                    {statusLabel(selectedConversation.status)}
                  </span>
                </div>
              ) : null}
              {session ? (
                <p className="text-xs text-slate-500">
                  {session.user.name} ({session.user.email})
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={!selectedConversationId || isUpdatingStatus}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                {isUpdatingStatus
                  ? "Güncelleniyor..."
                  : selectedConversation?.status === "RESOLVED"
                    ? "Reopen"
                    : "Resolve"}
              </button>
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
                onClick={() => router.push("/settings/channels")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Channels
              </button>
              <button
                type="button"
                onClick={() => router.push("/settings/team")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                Team
              </button>
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
