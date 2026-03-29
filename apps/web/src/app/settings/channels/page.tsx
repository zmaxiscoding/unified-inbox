"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; name: string; email: string };
type Session = { user: User; organization: { id: string; name: string } };
type ConnectedChannel = {
  id: string;
  provider: "WHATSAPP" | "INSTAGRAM" | string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  connectedAt: string;
};

type ConnectWhatsAppResponse = {
  id: string;
  provider: "WHATSAPP" | "INSTAGRAM" | string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  wabaId: string | null;
  connectedAt: string;
};

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

export default function ChannelsSettingsPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [channels, setChannels] = useState<ConnectedChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [wabaId, setWabaId] = useState("");

  const [igAccountId, setIgAccountId] = useState("");
  const [igAccessToken, setIgAccessToken] = useState("");
  const [igDisplayName, setIgDisplayName] = useState("");
  const [isConnectingIg, setIsConnectingIg] = useState(false);

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

  const fetchChannels = useCallback(async () => {
    const response = await fetch("/api/channels", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Kanallar alınamadı."));
    }

    return (await response.json()) as ConnectedChannel[];
  }, [router]);

  const reloadChannels = useCallback(async () => {
    const nextChannels = await fetchChannels();
    if (!nextChannels) return;

    setChannels(nextChannels);
  }, [fetchChannels]);

  useEffect(() => {
    const init = async () => {
      try {
        const nextSession = await fetchSession();
        if (!nextSession) return;
        setSession(nextSession);
        await reloadChannels();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Veriler yüklenirken hata oluştu.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, [fetchSession, reloadChannels]);

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
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "Instagram kanalı bağlanamadı."),
        );
      }

      const created = (await response.json()) as ConnectedChannel;
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
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, "WhatsApp kanalı bağlanamadı."),
        );
      }

      const created = (await response.json()) as ConnectWhatsAppResponse;
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
          <div className="flex items-center gap-2">
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

        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
              WhatsApp Connect
            </h2>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
              Connected: {connectedWhatsAppCount}
            </span>
          </div>

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
                    <th className="px-4 py-3">Account ID</th>
                    <th className="px-4 py-3">Display</th>
                    <th className="px-4 py-3">Connected At</th>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((channel) => (
                    <tr key={channel.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {channel.provider}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{channel.phoneNumberId}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {channel.displayPhoneNumber ?? "-"}
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
