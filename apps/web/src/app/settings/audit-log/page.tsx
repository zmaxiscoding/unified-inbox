"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = { id: string; name: string; email: string };
type Session = { user: User; organization: { id: string; name: string } };

type AuditLogItem = {
  id: string;
  createdAt: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  actor: { id: string; name: string };
};

type AuditLogsResponse = {
  items: AuditLogItem[];
  nextCursor: string | null;
  availableActions: string[];
};

type FilterState = {
  action: string;
  from: string;
  to: string;
};

const PAGE_SIZE = 20;

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

const formatDateInput = (value: Date) => value.toISOString().slice(0, 10);

const createDefaultFilters = (): FilterState => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 90);

  return {
    action: "",
    from: formatDateInput(from),
    to: formatDateInput(to),
  };
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const toUtcStartOfDay = (value: string) =>
  new Date(`${value}T00:00:00.000Z`).toISOString();

const toUtcEndOfDay = (value: string) =>
  new Date(`${value}T23:59:59.999Z`).toISOString();

const formatMetadata = (metadata: Record<string, unknown> | null) => {
  if (!metadata) return "-";

  try {
    return JSON.stringify(metadata);
  } catch {
    return "-";
  }
};

export default function AuditLogSettingsPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters());
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchAuditLogs = useCallback(
    async ({
      reset,
      cursor,
      nextFilters,
    }: {
      reset: boolean;
      cursor?: string | null;
      nextFilters: FilterState;
    }) => {
      if (nextFilters.from > nextFilters.to) {
        setError("Başlangıç tarihi bitiş tarihinden büyük olamaz.");
        return;
      }

      if (reset) {
        setIsApplying(true);
      } else {
        setIsLoadingMore(true);
      }

      setError(null);

      try {
        const params = new URLSearchParams();
        if (nextFilters.action) {
          params.set("action", nextFilters.action);
        }
        params.set("from", toUtcStartOfDay(nextFilters.from));
        params.set("to", toUtcEndOfDay(nextFilters.to));
        params.set("limit", String(PAGE_SIZE));
        if (cursor) {
          params.set("cursor", cursor);
        }

        const response = await fetch(`/api/audit-logs?${params.toString()}`, {
          cache: "no-store",
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 403) {
          setIsForbidden(true);
          setLogs([]);
          setNextCursor(null);
          setAvailableActions([]);
          return;
        }
        if (!response.ok) {
          throw new Error(
            await getErrorMessage(response, "Audit log verisi alınamadı."),
          );
        }

        const data = (await response.json()) as AuditLogsResponse;

        setIsForbidden(false);
        setAvailableActions(data.availableActions);
        setNextCursor(data.nextCursor);
        setLogs((current) => (reset ? data.items : [...current, ...data.items]));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Audit log verisi alınamadı.",
        );
      } finally {
        if (reset) {
          setIsApplying(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [router],
  );

  useEffect(() => {
    const init = async () => {
      try {
        const nextSession = await fetchSession();
        if (!nextSession) return;
        setSession(nextSession);
        await fetchAuditLogs({
          reset: true,
          nextFilters: filters,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Veriler yüklenirken hata oluştu.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void init();
    // We intentionally run bootstrap only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAuditLogs, fetchSession]);

  const handleApplyFilters = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await fetchAuditLogs({
      reset: true,
      nextFilters: filters,
    });
  };

  const handleResetFilters = async () => {
    const defaults = createDefaultFilters();
    setFilters(defaults);

    await fetchAuditLogs({
      reset: true,
      nextFilters: defaults,
    });
  };

  const handleLoadMore = async () => {
    if (!nextCursor || isLoadingMore || isApplying) return;

    await fetchAuditLogs({
      reset: false,
      cursor: nextCursor,
      nextFilters: filters,
    });
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
        <p className="text-sm text-slate-500">Audit log ekranı yüklenemedi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Audit Log</h1>
            <p className="text-xs text-slate-500">
              {session.organization.name} • {session.user.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => router.push("/settings/team")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Team
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings/channels")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Channels
            </button>
            <button
              type="button"
              onClick={() => router.push("/inbox")}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Inbox
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {error ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {isForbidden ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4">
            <h2 className="text-sm font-semibold text-amber-900">Erişim yok</h2>
            <p className="mt-1 text-sm text-amber-800">
              Bu ekranı yalnızca owner kullanıcılar görüntüleyebilir.
            </p>
          </section>
        ) : (
          <>
            <section className="mb-6 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
              <form
                onSubmit={(event) => void handleApplyFilters(event)}
                className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
              >
                <label className="text-sm text-slate-700">
                  Action
                  <select
                    value={filters.action}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        action: event.target.value,
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"
                  >
                    <option value="">All actions</option>
                    {availableActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-slate-700">
                  Başlangıç Tarihi
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        from: event.target.value,
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                    required
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Bitiş Tarihi
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(event) =>
                      setFilters((current) => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                    required
                  />
                </label>

                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
                  <button
                    type="submit"
                    disabled={isApplying}
                    className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isApplying ? "Uygulanıyor..." : "Uygula"}
                  </button>
                  <button
                    type="button"
                    disabled={isApplying}
                    onClick={() => void handleResetFilters()}
                    className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    Sıfırla
                  </button>
                </div>
              </form>
            </section>

            {logs.length === 0 ? (
              <section className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-center">
                <p className="text-sm text-slate-500">Seçilen filtrelerde kayıt bulunamadı.</p>
              </section>
            ) : (
              <>
                <section className="md:hidden">
                  <div className="space-y-3">
                    {logs.map((log) => (
                      <article
                        key={log.id}
                        className="rounded-lg border border-slate-200 bg-white p-4"
                      >
                        <p className="text-xs text-slate-500">
                          {formatDateTime(log.createdAt)}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {log.action}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Actor: {log.actor.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Target: {log.targetId ?? "-"}
                        </p>
                        <p className="mt-2 break-all text-xs text-slate-500">
                          Metadata: {formatMetadata(log.metadata)}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Actor</th>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">Target</th>
                        <th className="px-4 py-3">Metadata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-50 align-top last:border-0">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{log.actor.name}</td>
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{log.targetId ?? "-"}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            <p className="max-w-xl break-all">{formatMetadata(log.metadata)}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                {nextCursor ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => void handleLoadMore()}
                      disabled={isLoadingMore}
                      className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      {isLoadingMore ? "Yükleniyor..." : "Load more"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
