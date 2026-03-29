import EmailVerificationPageClient from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function EmailVerificationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawToken = resolvedSearchParams.token;
  const rawEmail = resolvedSearchParams.email;

  const token = Array.isArray(rawToken) ? (rawToken[0] ?? "") : (rawToken ?? "");
  const email = Array.isArray(rawEmail) ? (rawEmail[0] ?? "") : (rawEmail ?? "");

  return <EmailVerificationPageClient token={token} initialEmail={email} />;
}
