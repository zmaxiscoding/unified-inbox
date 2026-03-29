"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_LOGIN_EMAIL = "agent@acme.com";
const DEFAULT_LOGIN_PASSWORD = "AgentPass123!";

type LoginResponse =
  | {
      requiresOrganizationSelection: true;
      user: { id: string; email: string; name: string };
      organizations: { id: string; name: string; slug: string }[];
    }
  | {
      requiresOrganizationSelection: false;
      user: { id: string; email: string; name: string };
      organization: { id: string; name: string; slug: string };
    };

type BootstrapStatusResponse = {
  bootstrapEnabled: boolean;
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

export default function LoginPageClient({
  redirectTo,
}: {
  redirectTo: string;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "bootstrap">("login");
  const [isInitializing, setIsInitializing] = useState(true);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);
  const [email, setEmail] = useState(DEFAULT_LOGIN_EMAIL);
  const [password, setPassword] = useState(DEFAULT_LOGIN_PASSWORD);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState("owner@acme.com");
  const [bootstrapPassword, setBootstrapPassword] = useState("OwnerPass123!");
  const [bootstrapOrganizationName, setBootstrapOrganizationName] =
    useState("Acme Store");

  const completeLogin = async (organizationId?: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, organizationId }),
      });

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(
            response,
            "Giriş başarısız. E-posta, şifre ve üyelikleri kontrol edin.",
          ),
        );
      }

      const data = (await response.json()) as LoginResponse;
      if (data.requiresOrganizationSelection) {
        setOrganizations(data.organizations);
        return;
      }

      router.replace(redirectTo);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Giriş başarısız. E-posta, şifre ve üyelikleri kontrol edin.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await completeLogin();
  };

  const handleBootstrap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bootstrapName.trim(),
          email: bootstrapEmail.trim(),
          password: bootstrapPassword,
          organizationName: bootstrapOrganizationName.trim(),
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          setBootstrapEnabled(false);
          setMode("login");
          throw new Error("İlk owner kurulumu tamamlanmış. Giriş yapın.");
        }

        throw new Error(
          await getErrorMessage(response, "İlk owner hesabı oluşturulamadı."),
        );
      }

      router.replace("/inbox");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "İlk owner hesabı oluşturulamadı.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [sessionResponse, bootstrapResponse] = await Promise.all([
          fetch("/api/auth/session", { cache: "no-store" }),
          fetch("/api/auth/bootstrap/status", { cache: "no-store" }),
        ]);

        if (cancelled) return;

        if (sessionResponse.ok) {
          router.replace(redirectTo);
          return;
        }

        if (bootstrapResponse.ok) {
          const data =
            (await bootstrapResponse.json()) as BootstrapStatusResponse;
          setBootstrapEnabled(data.bootstrapEnabled);
          if (data.bootstrapEnabled) {
            setMode("bootstrap");
          }
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [redirectTo, router]);

  if (isInitializing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <p className="text-sm text-slate-500">Yükleniyor...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Unified Inbox Login
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Cookie session akışı korunur; giriş artık e-posta ve şifre ile
              yapılır.
            </p>
          </div>
          {bootstrapEnabled ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              İlk kurulum açık
            </span>
          ) : null}
        </div>

        {bootstrapEnabled ? (
          <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMessage(null);
              }}
              className={`rounded-lg px-3 py-2 font-medium ${
                mode === "login"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              Giriş Yap
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("bootstrap");
                setErrorMessage(null);
              }}
              className={`rounded-lg px-3 py-2 font-medium ${
                mode === "bootstrap"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500"
              }`}
            >
              İlk Owner
            </button>
          </div>
        ) : null}

        {mode === "bootstrap" ? (
          <form onSubmit={handleBootstrap} className="mt-6 space-y-3">
            <label className="block text-sm text-slate-600">
              Workspace adı
              <input
                type="text"
                required
                minLength={1}
                value={bootstrapOrganizationName}
                onChange={(event) => setBootstrapOrganizationName(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Owner adı
              <input
                type="text"
                required
                minLength={1}
                value={bootstrapName}
                onChange={(event) => setBootstrapName(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <label className="block text-sm text-slate-600">
              E-posta
              <input
                type="email"
                required
                value={bootstrapEmail}
                onChange={(event) => setBootstrapEmail(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <label className="block text-sm text-slate-600">
              Şifre
              <input
                type="password"
                required
                minLength={8}
                value={bootstrapPassword}
                onChange={(event) => setBootstrapPassword(event.target.value)}
                className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
              />
            </label>

            <button
              type="submit"
              disabled={
                isLoading ||
                !bootstrapName.trim() ||
                !bootstrapOrganizationName.trim() ||
                bootstrapPassword.length < 8
              }
              className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isLoading ? "Owner oluşturuluyor..." : "İlk Owner'ı Oluştur"}
            </button>
          </form>
        ) : (
          <>
            {!bootstrapEnabled ? (
              <p className="mt-4 text-sm text-slate-500">
                Seed demo hesapları:
                <span className="font-medium text-slate-700">
                  {" "}
                  agent@acme.com / AgentPass123!
                </span>
                {" • "}
                <span className="font-medium text-slate-700">
                  owner@acme.com / OwnerPass123!
                </span>
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              <label className="block text-sm text-slate-600">
                E-posta
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setOrganizations([]);
                  }}
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
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setOrganizations([]);
                  }}
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-slate-500"
                />
              </label>

              <button
                type="submit"
                disabled={isLoading || password.length < 8}
                className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
              </button>
            </form>

            {organizations.length > 0 ? (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">
                  Şifre doğrulandı. Organizasyon seçin
                </p>
                <div className="mt-2 space-y-2">
                  {organizations.map((organization) => (
                    <button
                      key={organization.id}
                      type="button"
                      onClick={() => void completeLogin(organization.id)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      {organization.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
