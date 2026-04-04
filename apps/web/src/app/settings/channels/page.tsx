"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "OWNER" | "AGENT";
type User = { id: string; name: string; email: string };
type Session = { user: User; organization: { id: string; name: string } };
type TeamMember = {
  membershipId: string;
  role: Role;
  user: User;
};
type TeamData = {
  members: TeamMember[];
};
type ConnectedChannelApi = {
  id: string;
  provider: "WHATSAPP" | "INSTAGRAM" | string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  connectedAt: string;
};

type ConnectedChannelRow = {
  id: string;
  provider: "WHATSAPP" | "INSTAGRAM" | string;
  providerLabel: string;
  accountLabel: string;
  accountValue: string;
  displayLabel: string;
  displayValue: string;
  connectedAt: string;
};

const CHANNELS_FORBIDDEN_MESSAGE =
  "Bu ekran yalnızca owner rolüne açık. Bağlı kanalları görüntüleyebilirsiniz, ancak yeni bağlantı oluşturamazsınız.";

const getErrorMessage = async (response: Response, fallback: string) => {
  const body = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;

  if (!body?.message) return fallback;
  if (Array.isArray(body.message)) {
    return body.message.join(", ");
  }

  return body.message;
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

function normalizeChannelRow(channel: ConnectedChannelApi): ConnectedChannelRow {
  if (channel.provider === "INSTAGRAM") {
    return {
      id: channel.id,
      provider: channel.provider,
      providerLabel: "Instagram",
      accountLabel: "Instagram Account ID",
      accountValue: channel.phoneNumberId,
      displayLabel: "Display Name",
      displayValue: channel.displayPhoneNumber ?? "-",
      connectedAt: channel.connectedAt,
    };
  }

  return {
    id: channel.id,
    provider: channel.provider,
    providerLabel: "WhatsApp",
    accountLabel: "Phone Number ID",
    accountValue: channel.phoneNumberId,
    displayLabel: "Display Phone Number",
    displayValue: channel.displayPhoneNumber ?? "-",
    connectedAt: channel.connectedAt,
  };
}

export default function ChannelsSettingsPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [channels, setChannels] = useState<ConnectedChannelRow[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnectingIg, setIsConnectingIg] = useState(false);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [wabaId, setWabaId] = useState("");

  const [igAccountId, setIgAccountId] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igDisplayName, setIgDisplayName] = useState("");

  const fetchSession = useCallback(async () => {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }
    if (!response.ok) {
      throw new Error("Oturum doğrulanamadı.");
    }

    return (await response.json()) as Session;
  }, [router]);

  const fetchTeamRole = useCallback(async (userId: string) => {
    const response = await fetch("/api/team", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }
    if (response.status === 403) {
      // AGENT role cannot access GET /team — default to AGENT
      return "AGENT" as const;
    }
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Takım bilgisi alınamadı."));
    }

    const data = (await response.json()) as TeamData;
    return data.members.find((member) => member.user.id === userId)?.role ?? null;
  }, [router]);

  const fetchChannels = useCallback(async () => {
    const response = await fetch("/api/channels", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Kanallar alınamadı."));
    }

    const data = (await response.json()) as ConnectedChannelApi[];
    return data.map(normalizeChannelRow);
  }, [router]);

  const reloadRole = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }

    const nextRole = await fetchTeamRole(session.user.id);
    if (nextRole) {
      setCurrentUserRole(nextRole);
    }
  }, [fetchTeamRole, session?.user.id]);

  const handleForbidden = useCallback(
    async (message = CHANNELS_FORBIDDEN_MESSAGE) => {
      setAccessDeniedMessage(message);
      setError(null);
      await reloadRole();
    },
    [reloadRole],
  );

  useEffect(() => {
    const init = async () => {
      try {
        const nextSession = await fetchSession();
        if (!nextSession) return;
        setSession(nextSession);

        // Fetch role and channels independently — role failure must not block channels
        const [roleResult, channelsResult] = await Promise.allSettled([
          fetchTeamRole(nextSession.user.id),
          fetchChannels(),
        ]);

        if (roleResult.status === "fulfilled" && roleResult.value) {
          setCurrentUserRole(roleResult.value);
        }

        if (channelsResult.status === "fulfilled" && channelsResult.value) {
          setChannels(channelsResult.value);
        } else if (channelsResult.status === "rejected") {
          setError(
            channelsResult.reason instanceof Error
              ? channelsResult.reason.message
              : "Kanallar alınamadı.",
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Veriler yüklenirken hata oluştu.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, [fetchChannels, fetchSession, fetchTeamRole]);

  const isOwner = currentUserRole === "OWNER";
  const canManageChannels = isOwner && !accessDeniedMessage;

  const connectedWhatsAppCount = useMemo(
    () => channels.filter((channel) => channel.provider === "WHATSAPP").length,
    [channels],
  );

  const connectedInstagramCount = useMemo(
    () => channels.filter((channel) => channel.provider === "INSTAGRAM").length,
    [channels],
  );

  const handleConnectInstagram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!igAccountId.trim() || !igAccessToken.trim() || isConnectingIg) {
      return;
    }

    setIsConnectingIg(true);
    setError(null);

    try {
      const response = await fetch("/api/channels/instagram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: igAccountId.trim(),
          accessToken: igAccessToken.trim(),
          displayName: igDisplayName.trim() || undefined,
        }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        await handleForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "Instagram kanalı bağlanamadı."),
        );
      }

      const created = normalizeChannelRow(
        (await response.json()) as ConnectedChannelApi,
      );
      setChannels((current) => [created, ...current]);
      setIgAccountId("");
      setIgAccessToken("");
      setIgDisplayName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Instagram kanalı bağlanamadı.");
    } finally {
      setIsConnectingIg(false);
    }
  };

  const handleConnectWhatsApp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!phoneNumberId.trim() || !accessToken.trim() || isConnecting) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/channels/whatsapp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          displayPhoneNumber: displayPhoneNumber.trim() || undefined,
          wabaId: wabaId.trim() || undefined,
        }),
      });

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        await handleForbidden();
        return;
      }
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "WhatsApp kanalı bağlanamadı."),
        );
      }

      const created = normalizeChannelRow(
        (await response.json()) as ConnectedChannelApi,
      );
      setChannels((current) => [created, ...current]);
      setPhoneNumberId("");
      setAccessToken("");
      setDisplayPhoneNumber("");
      setWabaId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "WhatsApp kanalı bağlanamadı.");
    } finally {
      setIsConnecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Yükleniyor...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Kanal ayarları yüklenemedi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Channel Settings</h1>
            <p className="text-xs text-slate-500">
              {session.organization.name} • {session.user.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push("/settings/audit-log")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Audit Log
            </button>
            <button
              type="button"
              onClick={() => router.push("/inbox")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/team")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Team
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        {error ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {accessDeniedMessage ? (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {accessDeniedMessage}
          </div>
        ) : null}

        {!isOwner ? (
          <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
            Bağlı kanalları görüntüleyebilirsiniz. Yeni kanal bağlama işlemi
            yalnızca owner rolüne açıktır.
          </div>
        ) : null}

        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              WhatsApp Connect
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Connected: {connectedWhatsAppCount}
            </span>
          </div>

          {canManageChannels ? (
            <form onSubmit={handleConnectWhatsApp} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                Phone Number ID *
                <input
                  type="text"
                  value={phoneNumberId}
                  onChange={(event) => setPhoneNumberId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="e.g. 123456789012345"
                  required
                />
              </label>

              <label className="text-sm text-slate-700">
                Access Token *
                <input
                  type="password"
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="EAAG..."
                  required
                />
              </label>

              <label className="text-sm text-slate-700">
                Display Phone Number
                <input
                  type="text"
                  value={displayPhoneNumber}
                  onChange={(event) => setDisplayPhoneNumber(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="+90 555 111 22 33"
                />
              </label>

              <label className="text-sm text-slate-700">
                WABA ID
                <input
                  type="text"
                  value={wabaId}
                  onChange={(event) => setWabaId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="1029384756"
                />
              </label>

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isConnecting}
                  className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isConnecting ? "Bağlanıyor..." : "Connect WhatsApp"}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              Owner rolünde olduğunuzda WhatsApp bağlantısı ekleyebilirsiniz.
            </p>
          )}
        </section>

        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              Instagram Connect
            </h2>
            <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-xs font-medium text-fuchsia-700">
              Connected: {connectedInstagramCount}
            </span>
          </div>

          {canManageChannels ? (
            <form onSubmit={handleConnectInstagram} className="grid gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                Instagram Account ID *
                <input
                  type="text"
                  value={igAccountId}
                  onChange={(event) => setIgAccountId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="e.g. 17841400123456789"
                  required
                />
              </label>

              <label className="text-sm text-slate-700">
                Access Token *
                <input
                  type="password"
                  value={igAccessToken}
                  onChange={(event) => setIgAccessToken(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="EAAG..."
                  required
                />
              </label>

              <label className="text-sm text-slate-700">
                Display Name
                <input
                  type="text"
                  value={igDisplayName}
                  onChange={(event) => setIgDisplayName(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                  placeholder="@myshop"
                />
              </label>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isConnectingIg}
                  className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isConnectingIg ? "Bağlanıyor..." : "Connect Instagram"}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">
              Owner rolünde olduğunuzda Instagram bağlantısı ekleyebilirsiniz.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Connected Channels ({channels.length})
          </h2>

          {channels.length === 0 ? (
            <p className="text-sm text-slate-500">Henüz bağlı kanal bulunmuyor.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Account</th>
                    <th className="px-4 py-3">Display</th>
                    <th className="px-4 py-3">Connected At</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {channel.providerLabel}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {channel.accountLabel}
                        </span>
                        <span className="break-all">{channel.accountValue}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {channel.displayLabel}
                        </span>
                        <span className="break-all">{channel.displayValue}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDateTime(channel.connectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
