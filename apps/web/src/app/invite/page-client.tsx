"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const NEW_USER_REQUIRED_CODE = "INVITE_NEW_USER_REQUIRED";

const getErrorBody = async (response: Response) => {
  const body = (await response.json().catch(() => null)) as
    | { message?: string | string[]; code?: string }
    | null;

  return body;
};

const getErrorMessage = (
  body: { message?: string | string[] } | null,
  fallback: string,
) => {
  if (!body?.message) return fallback;
  if (Array.isArray(body.message)) {
    return body.message.join(", ");
  }

  return body.message;
};

export default function InvitePageClient({ token }: { token: string }) {
  const router = useRouter();
  const normalizedToken = useMemo(() => token.trim(), [token]);

  const [mode, setMode] = useState<"join" | "register">("join");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (response.ok) {
          router.replace("/inbox");
          return;
        }
      } finally {
        setIsCheckingSession(false);
      }
    };

    void checkSession();
  }, [router]);

  useEffect(() => {
    if (!normalizedToken) {
      setError("Invite token bulunamadı.");
    }
  }, [normalizedToken]);

  const handleJoinOnly = async () => {
    if (!normalizedToken || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: normalizedToken }),
      });

      if (response.ok) {
        await response.json().catch(() => null);
        router.replace("/inbox");
        return;
      }

      const body = await getErrorBody(response);
      const message = getErrorMessage(body, "Invite kabul edilemedi.");
      if (body?.code === NEW_USER_REQUIRED_CODE) {
        setMode("register");
        setInfo("Yeni kullanıcı için isim ve şifre belirleyin.");
        return;
      }

      setError(message);
    } catch {
      setError("API'ye ulaşılamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedToken || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: normalizedToken,
          name: name.trim(),
          password,
        }),
      });

      if (!response.ok) {
        const body = await getErrorBody(response);
        throw new Error(getErrorMessage(body, "Invite kabul edilemedi."));
      }

      await response.json().catch(() => null);
      router.replace("/inbox");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite kabul edilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p className="text-sm text-slate-500">Yükleniyor...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Invite Acceptance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Takıma katılmak için daveti onaylayın.
        </p>

        {!normalizedToken ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error ?? "Geçersiz davet linki."}
          </div>
        ) : mode === "join" ? (
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={() => void handleJoinOnly()}
              disabled={isSubmitting}
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Kontrol ediliyor..." : "Join"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Login&apos;e Git
            </button>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="mt-6 space-y-3">
            <label className="block text-sm text-slate-600">
              İsim
              <input
                type="text"
                required
                minLength={1}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Şifre
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || password.length < 8}
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Katılıyor..." : "Join"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("join");
                setError(null);
                setInfo(null);
              }}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hesabım Var
            </button>
          </form>
        )}

        {info ? (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {info}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>
    </main>
  );
}
