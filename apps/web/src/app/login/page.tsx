import LoginPageClient from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

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
      redirectTo={redirectTo.startsWith("/") ? redirectTo : "/inbox"}
    />
  );
}
