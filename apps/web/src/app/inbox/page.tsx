"use client";

import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  ConversationHeader,
  DevSimulatorPanel,
  InboxSidebar,
  MessageComposer,
  MessageList,
  NotesPanel,
  TagBar,
  VerificationBanner,
} from "./inbox-components";
import {
  ENABLE_DEV_ENDPOINTS,
  MESSAGE_CHARACTER_LIMIT,
  type AssignedMembership,
  type AssignConversationResponse,
  type Conversation,
  type Message,
  type Note,
  type OrganizationMember,
  type ResendVerificationResponse,
  type SessionInfo,
  type Tag,
  type UpdateConversationStatusResponse,
} from "./inbox-types";

export default function InboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
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
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );
  const [isSendingVerificationEmail, setIsSendingVerificationEmail] =
    useState(false);
  const [sseStatus, setSseStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterTagId, setFilterTagId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [simulateCustomerDisplay, setSimulateCustomerDisplay] = useState("");
  const [simulateText, setSimulateText] = useState("");
  const [isSimulatingInbound, setIsSimulatingInbound] = useState(false);
  const [simulateInboundMessage, setSimulateInboundMessage] = useState<
    string | null
  >(null);

  const activeConversationRef = useRef<string | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allTags = useMemo(() => {
    const tagMap = new Map<string, string>();

    for (const conversation of conversations) {
      for (const tag of conversation.tags) {
        tagMap.set(tag.id, tag.name);
      }
    }

    return Array.from(tagMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [conversations]);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const isResolvedConversation = selectedConversation?.status === "RESOLVED";
  const hasActiveFilters = Boolean(
    filterStatus || filterChannel || filterAssignee || filterTagId || searchTerm,
  );

  const handleSearchInputChange = useCallback((value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
    }, 400);
  }, []);

  const clearFilters = useCallback(() => {
    setFilterStatus("");
    setFilterChannel("");
    setFilterAssignee("");
    setFilterTagId("");
    setSearchInput("");
    setSearchTerm("");
  }, []);

  const applyConversationAssignment = useCallback(
    (conversationId: string, assignedMembership: AssignedMembership | null) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, assignedMembership }
            : conversation,
        ),
      );
    },
    [],
  );

  const applyConversationStatus = useCallback(
    (conversationId: string, status: Conversation["status"]) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, status }
            : conversation,
        ),
      );
    },
    [],
  );

  const applyConversationRead = useCallback((conversationId: string) => {
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, isUnread: false }
          : conversation,
      ),
    );
  }, []);

  const updateConversationTags = useCallback(
    (conversationId: string, tags: Tag[]) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, tags }
            : conversation,
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

      const queryString = params.toString();
      const response = await fetch(
        `/api/conversations${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );

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
        current && data.some((conversation) => conversation.id === current)
          ? current
          : data[0].id,
      );
    } catch {
      setErrorMessage("API'ye ulaşılamıyor. Backend ayakta mı kontrol edin.");
    } finally {
      setIsLoadingConversations(false);
    }
  }, [
    filterAssignee,
    filterChannel,
    filterStatus,
    filterTagId,
    router,
    searchTerm,
  ]);

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/conversations/members", {
        cache: "no-store",
      });

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

  const fetchMessages = useCallback(
    async (conversationId: string) => {
      setIsLoadingMessages(true);
      setErrorMessage(null);

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/messages`,
          {
            cache: "no-store",
          },
        );

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
        applyConversationRead(conversationId);
      } catch {
        if (activeConversationRef.current === conversationId) {
          setErrorMessage("Mesajlar alınırken hata oluştu.");
        }
      } finally {
        if (activeConversationRef.current === conversationId) {
          setIsLoadingMessages(false);
        }
      }
    },
    [applyConversationRead, router],
  );

  const fetchNotes = useCallback(
    async (conversationId: string) => {
      setIsLoadingNotes(true);

      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/notes`,
          {
            cache: "no-store",
          },
        );

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
    },
    [router],
  );

  const resendVerificationEmail = useCallback(async () => {
    if (!session || isSendingVerificationEmail) return;

    setIsSendingVerificationEmail(true);
    setVerificationMessage(null);

    try {
      const response = await fetch("/api/auth/email-verification/resend", {
        method: "POST",
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Verification request failed: ${response.status}`);
      }

      const body = (await response.json().catch(() => null)) as
        | ResendVerificationResponse
        | null;

      if (body?.deliveryState === "already-verified") {
        setVerificationMessage(
          "Bu hesap zaten doğrulanmış görünüyor. Sayfayı yenileyebilirsiniz.",
        );
      } else if (body?.deliveryState === "accepted") {
        setVerificationMessage(
          "Doğrulama isteği zaten alındı. Son linki kontrol edin veya biraz sonra tekrar deneyin.",
        );
      } else if (
        body?.deliveryState === "disabled" ||
        body?.deliveryMode === "disabled"
      ) {
        setVerificationMessage(
          "Bu ortamda e-posta gönderimi kapalı. Doğrulama linki otomatik gönderilemiyor.",
        );
      } else if (body?.deliveryMode === "outbox") {
        setVerificationMessage(
          "Doğrulama linki oluşturuldu. Local outbox preview dosyasını kontrol edin.",
        );
      } else {
        setVerificationMessage(
          "Doğrulama e-postasi gonderildi. Gelen kutunuzu kontrol edin.",
        );
      }
    } catch {
      setVerificationMessage("Doğrulama linki şu anda gönderilemedi.");
    } finally {
      setIsSendingVerificationEmail(false);
    }
  }, [isSendingVerificationEmail, router, session]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isCheckingSession || !session) return;
    void fetchMembers();
  }, [fetchMembers, isCheckingSession, session]);

  useEffect(() => {
    if (isCheckingSession || !session) return;
    void fetchConversations();
  }, [fetchConversations, isCheckingSession, session]);

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

  useEffect(() => {
    if (isCheckingSession || !session) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = () => {
      if (disposed) return;

      setSseStatus("connecting");
      eventSource = new EventSource("/api/events/stream");

      eventSource.onopen = () => {
        if (!disposed) {
          setSseStatus("connected");
        }
      };

      eventSource.addEventListener("message.created", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as {
            conversationId: string;
            payload: Record<string, unknown>;
          };
          const currentConversationId = activeConversationRef.current;

          if (currentConversationId === data.conversationId) {
            void fetchMessages(currentConversationId);
          }
          void fetchConversations();
        } catch {
          // Ignore malformed events.
        }
      });

      eventSource.addEventListener(
        "conversation.updated",
        (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data) as {
              conversationId: string;
              payload: { action: string };
            };
            const currentConversationId = activeConversationRef.current;

            void fetchConversations();
            if (currentConversationId === data.conversationId) {
              void fetchMessages(currentConversationId);
            }
          } catch {
            // Ignore malformed events.
          }
        },
      );

      eventSource.addEventListener("note.created", (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data) as { conversationId: string };
          const currentConversationId = activeConversationRef.current;

          if (currentConversationId === data.conversationId) {
            void fetchNotes(currentConversationId);
          }
        } catch {
          // Ignore malformed events.
        }
      });

      eventSource.onerror = () => {
        if (disposed) return;

        setSseStatus("disconnected");
        eventSource?.close();
        eventSource = null;
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      eventSource?.close();
      setSseStatus("disconnected");
    };
  }, [fetchConversations, fetchMessages, fetchNotes, isCheckingSession, session]);

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !selectedConversationId ||
      !draft.trim() ||
      draft.length > MESSAGE_CHARACTER_LIMIT ||
      isResolvedConversation
    ) {
      return;
    }

    setIsSending(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: draft }),
        },
      );

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 409) {
        setErrorMessage(
          "Bu konuşma resolved durumda. Mesaj göndermek için önce yeniden açın.",
        );
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
        setSimulateInboundMessage(
          `Simulate inbound başarısız (${response.status}).`,
        );
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

  const handleAddTag = async () => {
    const name = tagInput.trim();
    if (!selectedConversationId || !name || isAddingTag) return;

    setIsAddingTag(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/tags`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        throw new Error(`Add tag failed: ${response.status}`);
      }

      const newTag = (await response.json()) as Tag;
      const currentTags = selectedConversation?.tags ?? [];
      const alreadyExists = currentTags.some((tag) => tag.id === newTag.id);

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
      currentTags.filter((tag) => tag.id !== tagId),
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

  const handleNoteKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAddNote();
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
        : members.find((member) => member.membershipId === nextMembershipId) ??
          null;
    const optimisticAssignment: AssignedMembership | null =
      nextMembershipId === null
        ? null
        : {
            id: nextMembershipId,
            user: {
              id: previousAssignment?.user.id ?? `pending-${nextMembershipId}`,
              name:
                selectedMember?.name ??
                previousAssignment?.user.name ??
                "Atandı",
            },
          };

    setIsAssigning(true);
    setErrorMessage(null);
    applyConversationAssignment(selectedConversationId, optimisticAssignment);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/assign`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ membershipId: nextMembershipId }),
        },
      );

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
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );

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
        <VerificationBanner
          session={session}
          verificationMessage={verificationMessage}
          isSendingVerificationEmail={isSendingVerificationEmail}
          onResendVerificationEmail={() => void resendVerificationEmail()}
        />
      ) : null}

      {ENABLE_DEV_ENDPOINTS ? (
        <DevSimulatorPanel
          simulateCustomerDisplay={simulateCustomerDisplay}
          simulateText={simulateText}
          isSimulatingInbound={isSimulatingInbound}
          simulateInboundMessage={simulateInboundMessage}
          onCustomerDisplayChange={setSimulateCustomerDisplay}
          onTextChange={setSimulateText}
          onSubmit={handleSimulateInbound}
        />
      ) : null}

      <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-3rem)] md:flex-row">
        <InboxSidebar
          conversations={conversations}
          members={members}
          allTags={allTags}
          selectedConversationId={selectedConversationId}
          searchInput={searchInput}
          filterStatus={filterStatus}
          filterChannel={filterChannel}
          filterAssignee={filterAssignee}
          filterTagId={filterTagId}
          hasActiveFilters={hasActiveFilters}
          isLoadingConversations={isLoadingConversations}
          organizationName={session?.organization.name ?? "Konuşmalar"}
          sseStatus={sseStatus}
          onSearchChange={handleSearchInputChange}
          onFilterStatusChange={setFilterStatus}
          onFilterChannelChange={setFilterChannel}
          onFilterAssigneeChange={setFilterAssignee}
          onFilterTagChange={setFilterTagId}
          onClearFilters={clearFilters}
          onSelectConversation={setSelectedConversationId}
        />

        <section className="flex min-h-0 flex-1 flex-col">
          <ConversationHeader
            selectedConversation={selectedConversation}
            session={session}
            members={members}
            isUpdatingStatus={isUpdatingStatus}
            isLoadingMembers={isLoadingMembers}
            isAssigning={isAssigning}
            onToggleStatus={() => void handleToggleStatus()}
            onAssign={(membershipId) => void handleAssign(membershipId)}
            onOpenChannels={() => router.push("/settings/channels")}
            onOpenTeam={() => router.push("/settings/team")}
            onLogout={() => void logout()}
          />

          {selectedConversation ? (
            <TagBar
              selectedConversation={selectedConversation}
              tagInput={tagInput}
              isAddingTag={isAddingTag}
              onTagInputChange={setTagInput}
              onTagKeyDown={handleTagKeyDown}
              onRemoveTag={(tagId) => void handleRemoveTag(tagId)}
            />
          ) : null}

          {selectedConversation ? (
            <NotesPanel
              notes={notes}
              noteInput={noteInput}
              isLoadingNotes={isLoadingNotes}
              isAddingNote={isAddingNote}
              onNoteInputChange={setNoteInput}
              onNoteKeyDown={handleNoteKeyDown}
              onAddNote={() => void handleAddNote()}
            />
          ) : null}

          {errorMessage ? (
            <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <MessageList
            isCheckingSession={isCheckingSession}
            selectedConversationId={selectedConversationId}
            isLoadingMessages={isLoadingMessages}
            messages={messages}
          />

          <MessageComposer
            selectedConversationId={selectedConversationId}
            draft={draft}
            isSending={isSending}
            isResolvedConversation={isResolvedConversation}
            isUpdatingStatus={isUpdatingStatus}
            onDraftChange={(value) =>
              setDraft(value.slice(0, MESSAGE_CHARACTER_LIMIT))
            }
            onSubmit={handleSend}
            onReopenConversation={() => void handleToggleStatus()}
          />
        </section>
      </div>
    </main>
  );
}
