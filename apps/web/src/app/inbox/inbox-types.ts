export type AssignedMembership = {
  id: string;
  user: {
    id: string;
    name: string;
    email?: string;
  };
};

export type Tag = {
  id: string;
  name: string;
};

export type Note = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
};

export type Conversation = {
  id: string;
  status: "OPEN" | "RESOLVED" | string;
  customerDisplay: string;
  lastMessageAt: string | null;
  isUnread: boolean;
  channelProvider: "WHATSAPP" | "INSTAGRAM" | string;
  assignedMembership: AssignedMembership | null;
  tags: Tag[];
};

export type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND" | string;
  text: string;
  createdAt: string;
  senderDisplay: string | null;
};

export type SessionInfo = {
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
  emailVerificationMode?: "soft" | "login";
};

export type ResendVerificationResponse = {
  ok: boolean;
  deliveryMode?: "outbox" | "disabled" | "resend";
  deliveryState?: "accepted" | "already-verified" | "disabled" | "sent";
};

export type OrganizationMember = {
  membershipId: string;
  name: string;
  role: "OWNER" | "AGENT" | string;
};

export type AssignConversationResponse = {
  id: string;
  assignedMembership: AssignedMembership | null;
};

export type UpdateConversationStatusResponse = {
  id: string;
  status: "OPEN" | "RESOLVED" | string;
};

export type SseStatus = "connecting" | "connected" | "disconnected";

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
};

export const UNASSIGNED_VALUE = "__UNASSIGNED__";
export const MESSAGE_CHARACTER_LIMIT = 1000;
export const ENABLE_DEV_ENDPOINTS =
  process.env.NEXT_PUBLIC_ENABLE_DEV_ENDPOINTS === "true";
