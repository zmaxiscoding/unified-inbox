"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const INVITE_NEW_USER_REQUIRED_CODE = "INVITE_NEW_USER_REQUIRED";
const INVITE_LOGIN_REQUIRED_CODE = "INVITE_LOGIN_REQUIRED";
const INVITE_EXISTING_USER_PASSWORD_REQUIRED_CODE =
  "INVITE_EXISTING_USER_PASSWORD_REQUIRED";
const INVITE_ACCOUNT_ACTIVATION_REQUIRED_CODE =
  "INVITE_ACCOUNT_ACTIVATION_REQUIRED";
const INVITE_EMAIL_MISMATCH_CODE = "INVITE_EMAIL_MISMATCH";

type InviteMode = "join" | "register" | "verify" | "activate";

type SessionInfo = {
  user: { id: string; name: string; email: string };
  organization: { id: string; name: string; slug: string };
};

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
  const loginHref = useMemo(() => {
    if (!normalizedToken) return "/login";
    return `/login?redirect=${encodeURIComponent(`/invite?token=${normalizedToken}`)}`;
  }, [normalizedToken]);

  const [mode, setMode] = useState<InviteMode>("join");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (cancelled) return;

        if (response.ok) {
          const data = (await response.json()) as SessionInfo;
          setSessionInfo(data);

          if (!normalizedToken) {
            router.replace("/inbox");
            return;
          }
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    };

    void checkSession();

    return () => {
      cancelled = true;
    };
  }, [normalizedToken, router]);

  useEffect(() => {
    if (!normalizedToken) {
      setError("Invite token bulunamadı.");
    }
  }, [normalizedToken]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setSessionInfo(null);
    setInfo("Oturum kapatıldı. Doğru hesapla giriş yapabilirsiniz.");
    setError(null);
  };

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
      if (body?.code === INVITE_NEW_USER_REQUIRED_CODE) {
        setMode("register");
        setInfo("Yeni kullanıcı için isim ve şifre belirleyin.");
        setError(null);
        return;
      }

      if (body?.code === INVITE_EXISTING_USER_PASSWORD_REQUIRED_CODE) {
        setMode("verify");
        setInfo("Bu davet mevcut bir hesaba ait. Devam etmek için şifrenizi doğrulayın.");
        setError(null);
        return;
      }

      if (body?.code === INVITE_ACCOUNT_ACTIVATION_REQUIRED_CODE) {
        setMode("activate");
        setInfo(
          "Bu hesap daha önce şifresiz oluşturulmuş. Devam etmek için şimdi şifre belirleyin.",
        );
        setError(null);
        return;
      }

      if (body?.code === INVITE_LOGIN_REQUIRED_CODE) {
        setInfo("Bu davet mevcut bir hesaba ait. Giriş yaparak devam edin.");
        return;
      }

      if (body?.code === INVITE_EMAIL_MISMATCH_CODE) {
        setError(
          "Açık oturum davet edilen e-posta ile eşleşmiyor. Çıkış yapıp doğru hesapla tekrar deneyin.",
        );
        return;
      }

      setError(message);
    } catch {
      setError("API'ye ulaşılamadı.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCredentialSubmit = async (event: FormEvent<HTMLFormElement>) => {
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
          name: mode === "register" ? name.trim() : undefined,
          password,
        }),
      });

      if (!response.ok) {
        const body = await getErrorBody(response);
        if (body?.code === INVITE_NEW_USER_REQUIRED_CODE) {
          setMode("register");
          setInfo("Yeni kullanıcı için isim ve şifre belirleyin.");
          return;
        }
        if (body?.code === INVITE_EXISTING_USER_PASSWORD_REQUIRED_CODE) {
          setMode("verify");
          setInfo("Devam etmek için hesabınızın mevcut şifresini girin.");
          return;
        }
        if (body?.code === INVITE_ACCOUNT_ACTIVATION_REQUIRED_CODE) {
          setMode("activate");
          setInfo("Bu hesap için yeni bir şifre belirleyin.");
          return;
        }
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

  const isNameRequired = mode === "register";
  const passwordLabel =
    mode === "verify" ? "Mevcut Şifre" : mode === "activate" ? "Yeni Şifre" : "Şifre";
  const submitLabel =
    mode === "register"
      ? "Hesabı Aktive Et ve Katıl"
      : mode === "activate"
        ? "Şifre Belirle ve Katıl"
        : "Şifreyi Doğrula ve Katıl";

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
          Daveti kabul etmek için uygun hesabı doğrulayın veya yeni hesabınızı
          aktive edin.
        </p>

        {sessionInfo ? (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Açık oturum: <span className="font-medium">{sessionInfo.user.email}</span>
          </div>
        ) : null}

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
              {isSubmitting
                ? "Kontrol ediliyor..."
                : sessionInfo
                  ? "Bu Hesapla Daveti Kabul Et"
                  : "Daveti Kontrol Et"}
            </button>

            {sessionInfo ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Oturumu Kapat
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push(loginHref)}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Giriş Yap
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleCredentialSubmit} className="mt-6 space-y-3">
            {isNameRequired ? (
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
            ) : null}

            <label className="block text-sm text-slate-600">
              {passwordLabel}
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
              disabled={
                isSubmitting || (isNameRequired && !name.trim()) || password.length < 8
              }
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "İşleniyor..." : submitLabel}
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
