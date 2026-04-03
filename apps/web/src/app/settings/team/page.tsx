"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Role = "OWNER" | "AGENT";
type User = { id: string; name: string; email: string };
type Member = { membershipId: string; role: Role; user: User };
type Invite = {
  id: string;
  email: string;
  role: Role;
  expiresAt: string;
  createdAt: string;
};
type Session = { user: User; organization: { id: string; name: string } };
type TeamData = { members: Member[]; invites: Invite[] };
type InviteCreateResponse = { inviteId: string; inviteLink: string };

const TEAM_FORBIDDEN_MESSAGE =
  "Bu alan yalnızca owner rolüne açık. Takım listesini görebilirsiniz, ancak yönetim işlemleri yapamazsınız.";

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

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));

export default function TeamSettingsPage() {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("AGENT");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(
    null,
  );

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

  const fetchTeam = useCallback(async () => {
    const response = await fetch("/api/team", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/login");
      return null;
    }
    if (!response.ok) {
      throw new Error(await getErrorMessage(response, "Takım bilgisi alınamadı."));
    }

    return (await response.json()) as TeamData;
  }, [router]);

  const reloadTeam = useCallback(async () => {
    const nextTeam = await fetchTeam();
    if (nextTeam) setTeam(nextTeam);
  }, [fetchTeam]);

  useEffect(() => {
    const init = async () => {
      try {
        const nextSession = await fetchSession();
        if (!nextSession) return;
        setSession(nextSession);
        await reloadTeam();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Veriler yüklenirken hata oluştu.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, [fetchSession, reloadTeam]);

  const currentUserRole = useMemo(
    () =>
      team?.members.find((member) => member.user.id === session?.user.id)?.role ??
      null,
    [session?.user.id, team?.members],
  );
  const isOwner = currentUserRole === "OWNER";
  const canManageTeam = isOwner && !accessDeniedMessage;

  const handleForbidden = useCallback(
    async (message = TEAM_FORBIDDEN_MESSAGE) => {
      setAccessDeniedMessage(message);
      setBusyId(null);
      setIsInviting(false);
      setInviteLink(null);
      await reloadTeam();
    },
    [reloadTeam],
  );

  const handleInvite = async () => {
    if (!inviteEmail.trim() || isInviting) return;

    setIsInviting(true);
    setError(null);
    setInviteLink(null);

    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
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
        throw new Error(await getErrorMessage(response, "Davet gönderilemedi."));
      }

      const data = (await response.json()) as InviteCreateResponse;
      setInviteEmail("");
      setInviteLink(data.inviteLink);
      setIsCopied(false);
      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Davet gönderilemedi.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch {
      setError("Link kopyalanamadı. Manuel kopyalamayı deneyin.");
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setBusyId(inviteId);
    setError(null);

    try {
      const response = await fetch(`/api/invites/${inviteId}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        await handleForbidden();
        return;
      }
      if (!response.ok && response.status !== 204) {
        throw new Error(await getErrorMessage(response, "Davet iptal edilemedi."));
      }

      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Davet iptal edilemedi.");
    } finally {
      setBusyId(null);
    }
  };

  const handleChangeRole = async (membershipId: string, role: Role) => {
    setBusyId(membershipId);
    setError(null);

    try {
      const response = await fetch(`/api/memberships/${membershipId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
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
        throw new Error(await getErrorMessage(response, "Rol güncellenemedi."));
      }

      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rol güncellenemedi.");
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveMember = async (membershipId: string, name: string) => {
    if (!confirm(`${name} üyesini kaldırmak istiyor musunuz?`)) {
      return;
    }

    setBusyId(membershipId);
    setError(null);

    try {
      const response = await fetch(`/api/memberships/${membershipId}`, {
        method: "DELETE",
      });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (response.status === 403) {
        await handleForbidden();
        return;
      }
      if (!response.ok && response.status !== 204) {
        throw new Error(await getErrorMessage(response, "Üye kaldırılamadı."));
      }

      await reloadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Üye kaldırılamadı.");
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Yükleniyor...</p>
      </div>
    );
  }

  if (!session || !team) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Takım bilgisi yüklenemedi.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Team Settings</h1>
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
            Takımı görüntüleyebilirsiniz. Yönetim işlemleri yalnızca owner
            rolüne açıktır.
          </div>
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Members ({team.members.length})
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  {canManageTeam ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {team.members.map((member) => {
                  const isSelf = member.user.id === session.user.id;
                  const isBusy = busyId === member.membershipId;

                  return (
                    <tr
                      key={member.membershipId}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {member.user.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-slate-400">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{member.user.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            member.role === "OWNER"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {member.role}
                        </span>
                      </td>
                      {canManageTeam ? (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              value={member.role}
                              disabled={isBusy || isSelf}
                              onChange={(event) =>
                                void handleChangeRole(
                                  member.membershipId,
                                  event.target.value as Role,
                                )
                              }
                              className="h-8 rounded border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100"
                            >
                              <option value="OWNER">OWNER</option>
                              <option value="AGENT">AGENT</option>
                            </select>
                            <button
                              type="button"
                              disabled={isBusy || isSelf}
                              onClick={() =>
                                void handleRemoveMember(
                                  member.membershipId,
                                  member.user.name,
                                )
                              }
                              className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {canManageTeam ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-700">
              Invites
            </h2>

            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Email
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="newagent@example.com"
                    disabled={isInviting}
                    className="h-9 w-full rounded border border-slate-200 px-3 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as Role)}
                    disabled={isInviting}
                    className="h-9 rounded border border-slate-200 bg-white px-2 text-sm outline-none focus:border-slate-400 disabled:bg-slate-50"
                  >
                    <option value="AGENT">AGENT</option>
                    <option value="OWNER">OWNER</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleInvite()}
                  disabled={!inviteEmail.trim() || isInviting}
                  className="h-9 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isInviting ? "Inviting..." : "Invite"}
                </button>
              </div>

              {inviteLink ? (
                <div className="mt-3 flex items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2">
                  <p className="flex-1 truncate text-xs text-green-800">{inviteLink}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyLink()}
                    className="shrink-0 rounded bg-green-700 px-3 py-1 text-xs font-medium text-white hover:bg-green-800"
                  >
                    {isCopied ? "Copied" : "Copy"}
                  </button>
                </div>
              ) : null}
            </div>

            {team.invites.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium uppercase text-slate-500">
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Expires</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.invites.map((invite) => (
                      <tr key={invite.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-4 py-3 text-slate-900">{invite.email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {invite.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {formatDate(invite.expiresAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={busyId === invite.id}
                            onClick={() => void handleRevokeInvite(invite.id)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          >
                            {busyId === invite.id ? "..." : "Revoke"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No pending invites.</p>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
