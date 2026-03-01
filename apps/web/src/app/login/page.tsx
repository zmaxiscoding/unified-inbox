"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("agent@acme.com");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [organizations, setOrganizations] = useState<
    { id: string; name: string; slug: string }[]
  >([]);

  const completeLogin = async (organizationId?: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, organizationId }),
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      const data = (await response.json()) as LoginResponse;
      if (data.requiresOrganizationSelection) {
        setOrganizations(data.organizations);
        return;
      }

      router.replace("/inbox");
    } catch {
      setErrorMessage("Giriş başarısız. E-posta ve üyelikleri kontrol edin.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await completeLogin();
  };

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (response.ok) {
        router.replace("/inbox");
      }
    };

    void checkSession();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Unified Inbox Login</h1>
        <p className="mt-1 text-sm text-slate-500">
          Demo hesabı: <span className="font-medium">owner@acme.com</span> veya{" "}
          <span className="font-medium">agent@acme.com</span>
        </p>

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

          <button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-lg bg-slate-900 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>

        {organizations.length > 0 ? (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-700">Organizasyon seçin</p>
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

        {errorMessage ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </main>
  );
}
