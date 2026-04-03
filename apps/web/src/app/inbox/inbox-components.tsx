import { FormEvent, KeyboardEvent, useEffect, useRef } from "react";

import {
  CHANNEL_LABELS,
  MESSAGE_CHARACTER_LIMIT,
  UNASSIGNED_VALUE,
  type Conversation,
  type Message,
  type Note,
  type OrganizationMember,
  type SessionInfo,
  type SseStatus,
  type Tag,
} from "./inbox-types";
import {
  formatTimestamp,
  statusBadgeClass,
  statusLabel,
  toInitials,
} from "./inbox-utils";

type VerificationBannerProps = {
  session: SessionInfo;
  verificationMessage: string | null;
  isSendingVerificationEmail: boolean;
  onResendVerificationEmail: () => void;
};

export function VerificationBanner({
  session,
  verificationMessage,
  isSendingVerificationEmail,
  onResendVerificationEmail,
}: VerificationBannerProps) {
  return (
    <section className="mx-auto mb-3 flex w-full max-w-6xl items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          {session.emailVerificationMode === "login"
            ? "Login verification gate"
            : "Soft verification rollout"}
        </p>
        <p className="text-sm font-medium text-amber-900">
          E-posta doğrulaması henüz tamamlanmadı
        </p>
        <p className="text-xs text-amber-800">
          {session.emailVerificationMode === "login"
            ? "Bu oturum acik kaldi, ancak yeni girislerde e-posta dogrulamasi gerekecek."
            : "Bu sprintte enforcement acik degil; isterseniz dogrulama linkini yeniden gonderebilirsiniz."}
        </p>
        {verificationMessage ? (
          <p className="mt-1 text-xs text-amber-800">{verificationMessage}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onResendVerificationEmail}
        disabled={isSendingVerificationEmail}
        className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSendingVerificationEmail
          ? "Gönderiliyor..."
          : "Doğrulama Linki Gönder"}
      </button>
    </section>
  );
}

type DevSimulatorPanelProps = {
  simulateCustomerDisplay: string;
  simulateText: string;
  isSimulatingInbound: boolean;
  simulateInboundMessage: string | null;
  onCustomerDisplayChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function DevSimulatorPanel({
  simulateCustomerDisplay,
  simulateText,
  isSimulatingInbound,
  simulateInboundMessage,
  onCustomerDisplayChange,
  onTextChange,
  onSubmit,
}: DevSimulatorPanelProps) {
  return (
    <section className="mx-auto mb-3 w-full max-w-6xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
        Dev only
      </p>
      <p className="text-sm font-medium text-amber-900">Simulate inbound</p>
      <form
        onSubmit={onSubmit}
        className="mt-2 flex flex-col gap-2 md:flex-row md:items-center"
      >
        <input
          type="text"
          value={simulateCustomerDisplay}
          onChange={(event) => onCustomerDisplayChange(event.target.value)}
          placeholder="customerDisplay (optional)"
          className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500 md:w-64"
          disabled={isSimulatingInbound}
        />
        <input
          type="text"
          value={simulateText}
          onChange={(event) => onTextChange(event.target.value)}
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
  );
}

type InboxSidebarProps = {
  conversations: Conversation[];
  members: OrganizationMember[];
  allTags: Tag[];
  selectedConversationId: string | null;
  searchInput: string;
  filterStatus: string;
  filterChannel: string;
  filterAssignee: string;
  filterTagId: string;
  hasActiveFilters: boolean;
  isLoadingConversations: boolean;
  organizationName: string;
  sseStatus: SseStatus;
  onSearchChange: (value: string) => void;
  onFilterStatusChange: (value: string) => void;
  onFilterChannelChange: (value: string) => void;
  onFilterAssigneeChange: (value: string) => void;
  onFilterTagChange: (value: string) => void;
  onClearFilters: () => void;
  onSelectConversation: (conversationId: string) => void;
};

export function InboxSidebar({
  conversations,
  members,
  allTags,
  selectedConversationId,
  searchInput,
  filterStatus,
  filterChannel,
  filterAssignee,
  filterTagId,
  hasActiveFilters,
  isLoadingConversations,
  organizationName,
  sseStatus,
  onSearchChange,
  onFilterStatusChange,
  onFilterChannelChange,
  onFilterAssigneeChange,
  onFilterTagChange,
  onClearFilters,
  onSelectConversation,
}: InboxSidebarProps) {
  return (
    <aside className="flex h-[42%] w-full flex-col border-b border-slate-200 md:h-auto md:w-[360px] md:border-r md:border-b-0">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">Unified Inbox</h1>
          <span
            title={
              sseStatus === "connected"
                ? "Realtime connected"
                : sseStatus === "connecting"
                  ? "Connecting..."
                  : "Disconnected"
            }
            className={`inline-block h-2 w-2 rounded-full ${
              sseStatus === "connected"
                ? "bg-emerald-500"
                : sseStatus === "connecting"
                  ? "animate-pulse bg-amber-400"
                  : "bg-slate-300"
            }`}
          />
        </div>
        <p className="text-sm text-slate-500">{organizationName}</p>
      </div>

      <div className="space-y-2 border-b border-slate-200 px-4 py-3">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Ara (müşteri / mesaj)..."
          className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-slate-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <select
            value={filterStatus}
            onChange={(event) => onFilterStatusChange(event.target.value)}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="">Tüm Durumlar</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select
            value={filterChannel}
            onChange={(event) => onFilterChannelChange(event.target.value)}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="">Tüm Kanallar</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="INSTAGRAM">Instagram</option>
          </select>
          <select
            value={filterAssignee}
            onChange={(event) => onFilterAssigneeChange(event.target.value)}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="">Tüm Atamalar</option>
            {members.map((member) => (
              <option key={member.membershipId} value={member.membershipId}>
                {member.name}
              </option>
            ))}
          </select>
          <select
            value={filterTagId}
            onChange={(event) => onFilterTagChange(event.target.value)}
            className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-slate-400"
          >
            <option value="">Tüm Etiketler</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClearFilters}
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
            const unread = conversation.isUnread;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelectConversation(conversation.id)}
                className={`w-full border-b border-slate-100 px-5 py-4 text-left transition ${
                  selected
                    ? "bg-slate-900 text-white"
                    : unread
                      ? "bg-sky-50 hover:bg-sky-100/70"
                      : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {unread ? (
                      <span
                        aria-hidden="true"
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          selected ? "bg-sky-300" : "bg-sky-500"
                        }`}
                      />
                    ) : null}
                    <p
                      className={`truncate text-sm ${
                        unread ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {conversation.customerDisplay}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {conversation.assignedMembership ? (
                      <span
                        title={conversation.assignedMembership.user.name}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          selected
                            ? "bg-slate-700 text-slate-100"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {toInitials(conversation.assignedMembership.user.name)}
                      </span>
                    ) : null}
                    <span
                      className={`text-xs ${
                        selected ? "text-slate-200" : "text-slate-400"
                      }`}
                    >
                      {formatTimestamp(conversation.lastMessageAt)}
                    </span>
                  </div>
                </div>
                <p
                  className={`mt-1 text-xs ${
                    selected
                      ? "text-slate-300"
                      : unread
                        ? "text-sky-700"
                        : "text-slate-500"
                  }`}
                >
                  {CHANNEL_LABELS[conversation.channelProvider] ??
                    conversation.channelProvider}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {unread ? (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        selected
                          ? "bg-sky-500/20 text-sky-100"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      Okunmadı
                    </span>
                  ) : null}
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
  );
}

type ConversationHeaderProps = {
  selectedConversation: Conversation | null;
  session: SessionInfo | null;
  members: OrganizationMember[];
  isUpdatingStatus: boolean;
  isLoadingMembers: boolean;
  isAssigning: boolean;
  onToggleStatus: () => void;
  onAssign: (membershipId: string | null) => void;
  onOpenChannels: () => void;
  onOpenTeam: () => void;
  onLogout: () => void;
};

export function ConversationHeader({
  selectedConversation,
  session,
  members,
  isUpdatingStatus,
  isLoadingMembers,
  isAssigning,
  onToggleStatus,
  onAssign,
  onOpenChannels,
  onOpenTeam,
  onLogout,
}: ConversationHeaderProps) {
  const selectedConversationId = selectedConversation?.id ?? null;

  return (
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
          onClick={onToggleStatus}
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
              onAssign(value === UNASSIGNED_VALUE ? null : value);
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
          onClick={onOpenChannels}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Channels
        </button>
        <button
          type="button"
          onClick={onOpenTeam}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Team
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          Çıkış
        </button>
      </div>
    </header>
  );
}

type TagBarProps = {
  selectedConversation: Conversation;
  tagInput: string;
  isAddingTag: boolean;
  onTagInputChange: (value: string) => void;
  onTagKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onRemoveTag: (tagId: string) => void;
};

export function TagBar({
  selectedConversation,
  tagInput,
  isAddingTag,
  onTagInputChange,
  onTagKeyDown,
  onRemoveTag,
}: TagBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-6 py-2">
      {selectedConversation.tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {tag.name}
          <button
            type="button"
            onClick={() => onRemoveTag(tag.id)}
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
        onChange={(event) => onTagInputChange(event.target.value)}
        onKeyDown={onTagKeyDown}
        placeholder="Etiket ekle..."
        disabled={isAddingTag}
        className="h-7 w-28 rounded border border-slate-200 px-2 text-xs outline-none focus:border-slate-400 disabled:bg-slate-50"
      />
    </div>
  );
}

type NotesPanelProps = {
  notes: Note[];
  noteInput: string;
  isLoadingNotes: boolean;
  isAddingNote: boolean;
  onNoteInputChange: (value: string) => void;
  onNoteKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onAddNote: () => void;
};

export function NotesPanel({
  notes,
  noteInput,
  isLoadingNotes,
  isAddingNote,
  onNoteInputChange,
  onNoteKeyDown,
  onAddNote,
}: NotesPanelProps) {
  return (
    <div className="border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase text-slate-500">Notlar</h3>
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
          onChange={(event) => onNoteInputChange(event.target.value)}
          onKeyDown={onNoteKeyDown}
          placeholder="Not ekle..."
          disabled={isAddingNote}
          className="h-7 flex-1 rounded border border-slate-200 px-2 text-xs outline-none focus:border-slate-400 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={onAddNote}
          disabled={!noteInput.trim() || isAddingNote}
          className="h-7 rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isAddingNote ? "..." : "Ekle"}
        </button>
      </div>
    </div>
  );
}

type MessageListProps = {
  isCheckingSession: boolean;
  selectedConversationId: string | null;
  isLoadingMessages: boolean;
  messages: Message[];
};

export function MessageList({
  isCheckingSession,
  selectedConversationId,
  isLoadingMessages,
  messages,
}: MessageListProps) {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5">
      {isCheckingSession ? (
        <p className="text-sm text-slate-500">Oturum kontrol ediliyor...</p>
      ) : !selectedConversationId ? (
        <p className="text-sm text-slate-500">
          Mesajları görmek için soldan konuşma seçin.
        </p>
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
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.text}
              </p>
              <p
                className={`mt-2 text-xs ${
                  outbound ? "text-slate-300" : "text-slate-500"
                }`}
              >
                {(message.senderDisplay ?? "Bilinmiyor")} &bull;{" "}
                {formatTimestamp(message.createdAt)}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

type MessageComposerProps = {
  selectedConversationId: string | null;
  draft: string;
  isSending: boolean;
  isResolvedConversation: boolean;
  isUpdatingStatus: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReopenConversation: () => void;
};

export function MessageComposer({
  selectedConversationId,
  draft,
  isSending,
  isResolvedConversation,
  isUpdatingStatus,
  onDraftChange,
  onSubmit,
  onReopenConversation,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasConversation = Boolean(selectedConversationId);
  const isComposerDisabled =
    !selectedConversationId || isSending || isResolvedConversation;
  const canSend = !isComposerDisabled && draft.trim().length > 0;
  const remainingCharacters = MESSAGE_CHARACTER_LIMIT - draft.length;

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;

    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 180)}px`;
  }, [draft]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }

    event.preventDefault();
    if (canSend) {
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <form onSubmit={onSubmit} className="border-t border-slate-200 px-6 py-4">
      {isResolvedConversation ? (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <div>
            <p className="text-xs font-semibold text-amber-900">
              Bu konuşma resolved durumda.
            </p>
            <p className="text-xs text-amber-800">
              Mesaj göndermek için önce yeniden açın.
            </p>
          </div>
          <button
            type="button"
            onClick={onReopenConversation}
            disabled={isUpdatingStatus}
            className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUpdatingStatus ? "Açılıyor..." : "Yeniden Aç"}
          </button>
        </div>
      ) : null}

      <div
        className={`rounded-2xl border px-3 py-3 transition ${
          isComposerDisabled
            ? "border-slate-200 bg-slate-50"
            : "border-slate-300 bg-white shadow-sm"
        }`}
      >
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MESSAGE_CHARACTER_LIMIT}
            placeholder={
              isResolvedConversation
                ? "Resolved konuşma yeniden açılmadan mesaj gönderilemez"
                : hasConversation
                  ? "Mesaj yaz..."
                  : "Mesaj yazmak için bir konuşma seçin"
            }
            className={`max-h-[180px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none ${
              isComposerDisabled
                ? "cursor-not-allowed text-slate-500"
                : "text-slate-900"
            }`}
            disabled={isComposerDisabled}
          />
          <button
            type="submit"
            disabled={!canSend}
            className="h-11 rounded-lg bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSending ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs">
          <p
            className={
              isComposerDisabled ? "text-slate-500" : "text-slate-400"
            }
          >
            {hasConversation
              ? "Enter gönderir, Shift+Enter yeni satır ekler."
              : "Mesaj yazmak için önce bir konuşma seçin."}
          </p>
          <p
            className={
              remainingCharacters <= 100
                ? "font-medium text-amber-700"
                : "text-slate-400"
            }
          >
            {draft.length}/{MESSAGE_CHARACTER_LIMIT}
          </p>
        </div>
      </div>
    </form>
  );
}
