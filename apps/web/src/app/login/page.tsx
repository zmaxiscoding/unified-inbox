import LoginPageClient from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

function sanitizeRedirect(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return "/inbox";
  }

  if (trimmed.startsWith("//")) {
    return "/inbox";
  }

  return trimmed;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawRedirect = resolvedSearchParams.redirect;
  const redirectTo = Array.isArray(rawRedirect)
    ? (rawRedirect[0] ?? "")
    : (rawRedirect ?? "");

  return (
    <LoginPageClient
      redirectTo={sanitizeRedirect(redirectTo)}
    />
  );
}
