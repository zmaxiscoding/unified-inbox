import type { Page, Route } from "@playwright/test";

type Role = "OWNER" | "AGENT";

type User = {
  id: string;
  name: string;
  email: string;
};

type SessionInfo = {
  user: User & {
    emailVerifiedAt?: string | null;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  emailVerificationMode?: "soft" | "login";
};

type TeamMember = {
  membershipId: string;
  role: Role;
  user: User;
};

type Invite = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
};

type Conversation = {
  id: string;
  status: "OPEN" | "RESOLVED";
  customerDisplay: string;
  lastMessageAt: string | null;
  isUnread: boolean;
  channelProvider: "WHATSAPP" | "INSTAGRAM";
  assignedMembership: {
    id: string;
    user: {
      id: string;
      name: string;
      email?: string;
    };
  } | null;
  tags: { id: string; name: string }[];
};

type Message = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  createdAt: string;
  senderDisplay: string | null;
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

type ConnectedChannel = {
  id: string;
  provider: "WHATSAPP" | "INSTAGRAM";
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  connectedAt: string;
};

type AuditLogItem = {
  id: string;
  timestamp: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: { id: string; name: string; email?: string };
};

type ScenarioOptions = {
  bootstrapEnabled?: boolean;
  currentRole?: Role | null;
  inviteFlow?: "new-user" | null;
  inviteToken?: string;
};

type State = {
  bootstrapEnabled: boolean;
  session: SessionInfo | null;
  users: {
    owner: User;
    agent: User;
  };
  organization: SessionInfo["organization"];
  members: TeamMember[];
  invites: Invite[];
  channels: ConnectedChannel[];
  conversations: Conversation[];
  messagesByConversation: Record<string, Message[]>;
  notesByConversation: Record<string, Note[]>;
  auditLogs: AuditLogItem[];
  inviteFlow: "new-user" | null;
  inviteToken: string;
  inviteEmail: string;
  nextId: number;
};

const now = new Date();

function isoFromNow({
  days = 0,
  hours = 0,
  minutes = 0,
}: {
  days?: number;
  hours?: number;
  minutes?: number;
}) {
  return new Date(
    now.getTime() + days * 24 * 60 * 60 * 1000 + hours * 60 * 60 * 1000 + minutes * 60 * 1000,
  ).toISOString();
}

const NOW = isoFromNow({});

function createSession(user: User, organization: SessionInfo["organization"]): SessionInfo {
  return {
    user: {
      ...user,
      emailVerifiedAt: NOW,
    },
    organization,
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createDefaultState(options: ScenarioOptions): State {
  const organization = {
    id: "org_acme",
    name: "Acme Store",
    slug: "acme-store",
  };

  const users = {
    owner: {
      id: "user_owner",
      name: "Ayla Owner",
      email: "owner@acme.com",
    },
    agent: {
      id: "user_agent",
      name: "Ali Agent",
      email: "agent@acme.com",
    },
  } satisfies State["users"];

  const members: TeamMember[] = [
    {
      membershipId: "membership_owner",
      role: "OWNER",
      user: users.owner,
    },
    {
      membershipId: "membership_agent",
      role: "AGENT",
      user: users.agent,
    },
  ];

  const conversations: Conversation[] = [
    {
      id: "conv_ayse",
      status: "OPEN",
      customerDisplay: "Ayse Demir",
      lastMessageAt: "2026-03-31T08:55:00.000Z",
      isUnread: true,
      channelProvider: "WHATSAPP",
      assignedMembership: {
        id: "membership_agent",
        user: {
          id: users.agent.id,
          name: users.agent.name,
          email: users.agent.email,
        },
      },
      tags: [{ id: "tag_vip", name: "VIP" }],
    },
    {
      id: "conv_mert",
      status: "RESOLVED",
      customerDisplay: "Mert Kaya",
      lastMessageAt: "2026-03-30T17:20:00.000Z",
      isUnread: false,
      channelProvider: "INSTAGRAM",
      assignedMembership: null,
      tags: [],
    },
  ];

  const state: State = {
    bootstrapEnabled: Boolean(options.bootstrapEnabled),
    session:
      options.currentRole === "OWNER"
        ? createSession(users.owner, organization)
        : options.currentRole === "AGENT"
          ? createSession(users.agent, organization)
          : null,
    users,
    organization,
    members,
    invites: [
      {
        id: "invite_pending",
        email: "newagent@example.com",
        role: "AGENT",
        expiresAt: isoFromNow({ days: 7 }),
        createdAt: isoFromNow({ minutes: -30 }),
      },
    ],
    channels: [
      {
        id: "channel_whatsapp",
        provider: "WHATSAPP",
        phoneNumberId: "123456789012345",
        displayPhoneNumber: "+90 555 111 22 33",
        connectedAt: isoFromNow({ days: -11 }),
      },
      {
        id: "channel_instagram",
        provider: "INSTAGRAM",
        phoneNumberId: "17841400123456789",
        displayPhoneNumber: "@acme-store",
        connectedAt: isoFromNow({ days: -9 }),
      },
    ],
    conversations,
    messagesByConversation: {
      conv_ayse: [
        {
          id: "msg_inbound_1",
          direction: "INBOUND",
          text: "Merhaba, siparisimin durumu nedir?",
          createdAt: isoFromNow({ minutes: -5 }),
          senderDisplay: "Ayse Demir",
        },
      ],
      conv_mert: [
        {
          id: "msg_resolved_1",
          direction: "INBOUND",
          text: "Tesekkurler, sorun cozuldu.",
          createdAt: isoFromNow({ days: -1, hours: -3 }),
          senderDisplay: "Mert Kaya",
        },
      ],
    },
    notesByConversation: {
      conv_ayse: [
        {
          id: "note_1",
          body: "Kargo cikisini kontrol et.",
          createdAt: isoFromNow({ minutes: -4 }),
          author: {
            id: users.owner.id,
            name: users.owner.name,
            email: users.owner.email,
          },
        },
      ],
      conv_mert: [],
    },
    auditLogs: [
      {
        id: "audit_1",
        timestamp: isoFromNow({ minutes: -50 }),
        action: "INVITE_CREATED",
        targetId: "invite_pending",
        metadata: { email: "newagent@example.com", role: "AGENT" },
        actor: {
          id: users.owner.id,
          name: users.owner.name,
          email: users.owner.email,
        },
      },
      {
        id: "audit_2",
        timestamp: isoFromNow({ days: -1, hours: -1 }),
        action: "CHANNEL_CONNECTED",
        targetId: "channel_whatsapp",
        metadata: { provider: "WHATSAPP" },
        actor: {
          id: users.owner.id,
          name: users.owner.name,
          email: users.owner.email,
        },
      },
    ],
    inviteFlow: options.inviteFlow ?? null,
    inviteToken: options.inviteToken ?? "invite-new-user-token",
    inviteEmail: "newhire@acme.com",
    nextId: 100,
  };

  if (state.bootstrapEnabled) {
    state.members = [];
    state.invites = [];
    state.channels = [];
    state.conversations = [];
    state.messagesByConversation = {};
    state.notesByConversation = {};
    state.auditLogs = [];
  }

  return state;
}

function getCurrentRole(state: State): Role | null {
  if (!state.session) return null;

  return (
    state.members.find((member) => member.user.id === state.session?.user.id)?.role ?? null
  );
}

function requireSession(state: State) {
  return state.session !== null;
}

function nextId(state: State, prefix: string) {
  state.nextId += 1;
  return `${prefix}_${state.nextId}`;
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function fulfillNoContent(route: Route, status = 204) {
  await route.fulfill({ status, body: "" });
}

async function parseJsonBody(route: Route) {
  return (route.request().postDataJSON?.() ?? null) as Record<string, unknown> | null;
}

function filterConversations(state: State, searchParams: URLSearchParams) {
  let items = [...state.conversations];

  const status = searchParams.get("status");
  const channel = searchParams.get("channel");
  const assigneeId = searchParams.get("assigneeId");
  const tagId = searchParams.get("tagId");
  const search = searchParams.get("search")?.trim().toLocaleLowerCase("tr-TR");

  if (status) {
    items = items.filter((conversation) => conversation.status === status);
  }

  if (channel) {
    items = items.filter((conversation) => conversation.channelProvider === channel);
  }

  if (assigneeId) {
    items = items.filter(
      (conversation) => conversation.assignedMembership?.id === assigneeId,
    );
  }

  if (tagId) {
    items = items.filter((conversation) =>
      conversation.tags.some((tag) => tag.id === tagId),
    );
  }

  if (search) {
    items = items.filter((conversation) => {
      const inConversation = conversation.customerDisplay
        .toLocaleLowerCase("tr-TR")
        .includes(search);
      const inMessages = (state.messagesByConversation[conversation.id] ?? []).some(
        (message) => message.text.toLocaleLowerCase("tr-TR").includes(search),
      );

      return inConversation || inMessages;
    });
  }

  return items;
}

async function handleApiRoute(route: Route, state: State) {
  const request = route.request();
  const url = new URL(request.url());
  const { pathname, searchParams } = url;
  const method = request.method();

  if (pathname === "/api/auth/session" && method === "GET") {
    if (!state.session) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(route, 200, state.session);
    return;
  }

  if (pathname === "/api/auth/bootstrap/status" && method === "GET") {
    await fulfillJson(route, 200, {
      bootstrapEnabled: state.bootstrapEnabled,
    });
    return;
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await parseJsonBody(route);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    const matchesAgent =
      email === "agent@acme.com" && password === "AgentPass123!";
    const matchesOwner =
      email === "owner@acme.com" && password === "OwnerPass123!";

    if (!matchesAgent && !matchesOwner) {
      await fulfillJson(route, 401, {
        message: "Giriş başarısız. E-posta, şifre ve üyelikleri kontrol edin.",
      });
      return;
    }

    const user = matchesOwner ? state.users.owner : state.users.agent;
    state.session = createSession(user, state.organization);

    await fulfillJson(route, 200, {
      requiresOrganizationSelection: false,
      user,
      organization: state.organization,
    });
    return;
  }

  if (pathname === "/api/auth/bootstrap" && method === "POST") {
    if (!state.bootstrapEnabled) {
      await fulfillJson(route, 409, {
        message: "İlk owner kurulumu tamamlanmış. Giriş yapın.",
      });
      return;
    }

    const body = await parseJsonBody(route);
    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const organizationName = String(body?.organizationName ?? "").trim();

    state.organization = {
      ...state.organization,
      name: organizationName || state.organization.name,
      slug: (organizationName || state.organization.name)
        .toLocaleLowerCase("en-US")
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, ""),
    };

    const owner = {
      id: nextId(state, "user"),
      name: name || "Bootstrap Owner",
      email: email || "bootstrap-owner@acme.com",
    };

    state.users.owner = owner;
    state.members = [
      {
        membershipId: nextId(state, "membership"),
        role: "OWNER",
        user: owner,
      },
    ];
    state.session = createSession(owner, state.organization);
    state.bootstrapEnabled = false;

    await fulfillJson(route, 201, {
      ok: true,
      user: owner,
      organization: state.organization,
    });
    return;
  }

  if (pathname === "/api/auth/logout" && method === "POST") {
    state.session = null;
    await fulfillJson(route, 200, { ok: true });
    return;
  }

  if (pathname === "/api/invites/accept" && method === "POST") {
    const body = await parseJsonBody(route);
    const token = String(body?.token ?? "").trim();

    if (token !== state.inviteToken) {
      await fulfillJson(route, 400, { message: "Geçersiz invite token." });
      return;
    }

    if (state.inviteFlow === "new-user") {
      const name = String(body?.name ?? "").trim();
      const password = String(body?.password ?? "");

      if (!name || password.length < 8) {
        await fulfillJson(route, 409, {
          code: "INVITE_NEW_USER_REQUIRED",
          message: "Yeni kullanıcı için isim ve şifre belirleyin.",
        });
        return;
      }

      const invitedUser: User = {
        id: nextId(state, "user"),
        name,
        email: state.inviteEmail,
      };

      state.members.push({
        membershipId: nextId(state, "membership"),
        role: "AGENT",
        user: invitedUser,
      });
      state.session = createSession(invitedUser, state.organization);
      state.inviteFlow = null;

      await fulfillJson(route, 200, { ok: true });
      return;
    }

    await fulfillJson(route, 200, { ok: true });
    return;
  }

  if (pathname === "/api/team" && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(route, 200, {
      members: state.members,
      invites: state.invites,
    });
    return;
  }

  if (pathname === "/api/invites" && method === "POST") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }
    if (getCurrentRole(state) !== "OWNER") {
      await fulfillJson(route, 403, { message: "Forbidden" });
      return;
    }

    const body = await parseJsonBody(route);
    const invite: Invite = {
      id: nextId(state, "invite"),
      email: String(body?.email ?? "").trim().toLowerCase(),
      role: String(body?.role ?? "AGENT") === "OWNER" ? "OWNER" : "AGENT",
      expiresAt: isoFromNow({ days: 7 }),
      createdAt: NOW,
    };

    state.invites.unshift(invite);
    await fulfillJson(route, 201, {
      inviteId: invite.id,
      inviteLink: `/invite?token=${invite.id}-token`,
    });
    return;
  }

  if (pathname.startsWith("/api/invites/") && method === "DELETE") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }
    if (getCurrentRole(state) !== "OWNER") {
      await fulfillJson(route, 403, { message: "Forbidden" });
      return;
    }

    const inviteId = pathname.split("/").pop();
    state.invites = state.invites.filter((invite) => invite.id !== inviteId);
    await fulfillNoContent(route);
    return;
  }

  if (pathname === "/api/channels" && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(route, 200, state.channels);
    return;
  }

  if (
    (pathname === "/api/channels/whatsapp/connect" ||
      pathname === "/api/channels/instagram/connect") &&
    method === "POST"
  ) {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }
    if (getCurrentRole(state) !== "OWNER") {
      await fulfillJson(route, 403, { message: "Forbidden" });
      return;
    }

    const body = await parseJsonBody(route);
    const provider = pathname.includes("instagram") ? "INSTAGRAM" : "WHATSAPP";
    const channel: ConnectedChannel = {
      id: nextId(state, "channel"),
      provider,
      phoneNumberId:
        provider === "INSTAGRAM"
          ? String(body?.instagramAccountId ?? "")
          : String(body?.phoneNumberId ?? ""),
      displayPhoneNumber:
        provider === "INSTAGRAM"
          ? String(body?.displayName ?? "") || null
          : String(body?.displayPhoneNumber ?? "") || null,
      connectedAt: NOW,
    };

    state.channels.unshift(channel);
    await fulfillJson(route, 201, channel);
    return;
  }

  if (pathname === "/api/audit-logs" && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }
    if (getCurrentRole(state) !== "OWNER") {
      await fulfillJson(route, 403, { message: "Forbidden" });
      return;
    }

    const action = searchParams.get("action");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Number(searchParams.get("limit") ?? "20");
    const cursor = Number(searchParams.get("cursor") ?? "0");

    let logs = [...state.auditLogs];
    if (action) {
      logs = logs.filter((log) => log.action === action);
    }
    if (from) {
      logs = logs.filter((log) => log.timestamp >= from);
    }
    if (to) {
      logs = logs.filter((log) => log.timestamp <= to);
    }

    const items = logs.slice(cursor, cursor + limit);
    const nextCursor = cursor + limit < logs.length ? String(cursor + limit) : null;

    await fulfillJson(route, 200, {
      items,
      pageInfo: { nextCursor },
    });
    return;
  }

  if (pathname === "/api/conversations/members" && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(
      route,
      200,
      state.members.map((member) => ({
        membershipId: member.membershipId,
        name: member.user.name,
        role: member.role,
      })),
    );
    return;
  }

  if (pathname === "/api/conversations" && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(route, 200, filterConversations(state, searchParams));
    return;
  }

  const messageMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages$/);
  if (messageMatch && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const msgs = state.messagesByConversation[messageMatch[1]] ?? [];
    await fulfillJson(route, 200, { messages: msgs, markedAsRead: true });
    return;
  }

  if (messageMatch && method === "POST") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const conversationId = messageMatch[1];
    const conversation = state.conversations.find((item) => item.id === conversationId);

    if (!conversation) {
      await fulfillJson(route, 404, { message: "Conversation not found" });
      return;
    }

    if (conversation.status === "RESOLVED") {
      await fulfillJson(route, 409, { message: "Conversation is resolved." });
      return;
    }

    const body = await parseJsonBody(route);
    const message: Message = {
      id: nextId(state, "msg"),
      direction: "OUTBOUND",
      text: String(body?.text ?? "").trim(),
      createdAt: NOW,
      senderDisplay: state.session?.user.name ?? "Agent",
    };

    state.messagesByConversation[conversationId] = [
      ...(state.messagesByConversation[conversationId] ?? []),
      message,
    ];
    conversation.lastMessageAt = NOW;
    conversation.isUnread = false;

    await fulfillJson(route, 201, message);
    return;
  }

  const noteMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/notes$/);
  if (noteMatch && method === "GET") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    await fulfillJson(route, 200, state.notesByConversation[noteMatch[1]] ?? []);
    return;
  }

  if (noteMatch && method === "POST") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const conversationId = noteMatch[1];
    const body = await parseJsonBody(route);
    const note: Note = {
      id: nextId(state, "note"),
      body: String(body?.body ?? "").trim(),
      createdAt: NOW,
      author: {
        id: state.session?.user.id ?? "user_unknown",
        name: state.session?.user.name ?? "Unknown",
        email: state.session?.user.email ?? "unknown@example.com",
      },
    };

    state.notesByConversation[conversationId] = [
      ...(state.notesByConversation[conversationId] ?? []),
      note,
    ];

    await fulfillJson(route, 201, note);
    return;
  }

  const tagMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/tags$/);
  if (tagMatch && method === "POST") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const conversation = state.conversations.find((item) => item.id === tagMatch[1]);
    if (!conversation) {
      await fulfillJson(route, 404, { message: "Conversation not found" });
      return;
    }

    const body = await parseJsonBody(route);
    const name = String(body?.name ?? "").trim();
    const existing = conversation.tags.find((tag) => tag.name === name);
    const tag =
      existing ??
      ({
        id: nextId(state, "tag"),
        name,
      } satisfies Conversation["tags"][number]);

    if (!existing) {
      conversation.tags.push(tag);
    }

    await fulfillJson(route, 201, tag);
    return;
  }

  const deleteTagMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/tags\/([^/]+)$/);
  if (deleteTagMatch && method === "DELETE") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const [conversationId, tagId] = deleteTagMatch.slice(1);
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      await fulfillJson(route, 404, { message: "Conversation not found" });
      return;
    }

    conversation.tags = conversation.tags.filter((tag) => tag.id !== tagId);
    await fulfillNoContent(route);
    return;
  }

  const assignMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/assign$/);
  if (assignMatch && method === "PATCH") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const conversation = state.conversations.find((item) => item.id === assignMatch[1]);
    if (!conversation) {
      await fulfillJson(route, 404, { message: "Conversation not found" });
      return;
    }

    const body = await parseJsonBody(route);
    const membershipId =
      typeof body?.membershipId === "string" ? body.membershipId : null;
    const member =
      membershipId === null
        ? null
        : state.members.find((item) => item.membershipId === membershipId) ?? null;

    conversation.assignedMembership = member
      ? {
          id: member.membershipId,
          user: {
            id: member.user.id,
            name: member.user.name,
            email: member.user.email,
          },
        }
      : null;

    await fulfillJson(route, 200, {
      id: conversation.id,
      assignedMembership: cloneJson(conversation.assignedMembership),
    });
    return;
  }

  const statusMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/status$/);
  if (statusMatch && method === "PATCH") {
    if (!requireSession(state)) {
      await fulfillJson(route, 401, { message: "Unauthorized" });
      return;
    }

    const conversation = state.conversations.find((item) => item.id === statusMatch[1]);
    if (!conversation) {
      await fulfillJson(route, 404, { message: "Conversation not found" });
      return;
    }

    const body = await parseJsonBody(route);
    conversation.status =
      String(body?.status ?? "").toUpperCase() === "RESOLVED" ? "RESOLVED" : "OPEN";

    await fulfillJson(route, 200, {
      id: conversation.id,
      status: conversation.status,
    });
    return;
  }

  await fulfillJson(route, 404, {
    message: `Unhandled mocked route: ${method} ${pathname}`,
  });
}

async function installEventSourceStub(page: Page) {
  await page.addInitScript(() => {
    class MockEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;

      readyState = MockEventSource.OPEN;
      url: string;
      withCredentials = false;
      onopen: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      constructor(url: string | URL) {
        this.url = String(url);
        queueMicrotask(() => {
          this.onopen?.(new Event("open"));
        });
      }

      addEventListener() {}

      removeEventListener() {}

      dispatchEvent() {
        return true;
      }

      close() {
        this.readyState = MockEventSource.CLOSED;
      }
    }

    Object.defineProperty(window, "EventSource", {
      configurable: true,
      writable: true,
      value: MockEventSource,
    });
  });
}

export async function mockUnifiedInboxApi(page: Page, options: ScenarioOptions = {}) {
  const state = createDefaultState(options);

  await installEventSourceStub(page);
  await page.route("**/api/**", async (route) => {
    await handleApiRoute(route, state);
  });

  return state;
}
