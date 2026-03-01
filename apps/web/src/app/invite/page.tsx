import InvitePageClient from "./page-client";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const rawToken = resolvedSearchParams.token;
  const token = Array.isArray(rawToken) ? (rawToken[0] ?? "") : (rawToken ?? "");

  return <InvitePageClient token={token} />;
}
