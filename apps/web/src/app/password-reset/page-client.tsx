"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

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

type AuthLinkRequestResponse = {
  ok: boolean;
  deliveryMode?: "outbox" | "disabled";
};

export default function PasswordResetPageClient({
  token,
  initialEmail,
}: {
  token: string;
  initialEmail: string;
}) {
  const normalizedToken = useMemo(() => token.trim(), [token]);
  const [email, setEmail] = useState(initialEmail.trim());
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleRequestSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            "Şifre sıfırlama isteği gönderilemedi.",
          ),
        );
      }

      const body = (await response.json().catch(() => null)) as
        | AuthLinkRequestResponse
        | null;

      if (body?.deliveryMode === "disabled") {
        setSuccessMessage(
          "Bu ortamda e-posta gönderimi kapalı olduğu için şifre sıfırlama linki otomatik gönderilemiyor.",
        );
      } else {
        setSuccessMessage(
          "Bu e-posta ile bir hesap varsa, istek alındı. Bu ortam outbox kullanıyor; teslim başarılı olduysa preview dosyası oluşur.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Şifre sıfırlama isteği gönderilemedi.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: normalizedToken, password }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, "Şifre güncellenemedi."));
      }

      setPassword("");
      setSuccessMessage("Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Şifre güncellenemedi.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Şifre Sıfırla</h1>
        <p className="mt-1 text-sm text-slate-500">
          {normalizedToken
            ? "Yeni şifrenizi belirleyin."
            : "Şifre sıfırlama linkini tekrar gönderelim."}
        </p>

        {normalizedToken ? (
          <form onSubmit={handleConfirmSubmit} className="mt-6 space-y-3">
            <label className="block text-sm text-slate-600">
              Yeni Şifre
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
              disabled={isSubmitting || password.length < 8}
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestSubmit} className="mt-6 space-y-3">
            <label className="block text-sm text-slate-600">
              E-posta
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <button
              type="submit"
              disabled={isSubmitting || !email.trim()}
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting ? "Gönderiliyor..." : "Şifre Sıfırlama Linki Gönder"}
            </button>
          </form>
        )}

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-5 text-sm text-slate-500">
          <Link href="/login" className="font-medium text-slate-700 hover:text-slate-900">
            Giriş ekranına dön
          </Link>
        </div>
      </div>
    </main>
  );
}
