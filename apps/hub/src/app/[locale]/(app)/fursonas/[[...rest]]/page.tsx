import { redirect } from "@/shared/infrastructure/i18n/navigation";

/**
 * Sends every old `/fursonas` address to its `/pages` twin.
 *
 * The section was renamed when the person's own profile joined the list: every
 * row is one public page, and "fursonas" stopped describing what is there.
 *
 * **An optional catch-all, so a bookmarked editor survives too.** `/fursonas`
 * becomes `/pages`, and `/fursonas/luna/edit` becomes `/pages/luna/edit`,
 * rather than only the list being rescued while every deeper link 404s.
 *
 * **The old segment stays RESERVED even though nothing renders here.** Freeing
 * it would let somebody take `fursonas` as a vanity address, and every link
 * anybody had shared to their own list would begin resolving to that stranger's
 * profile. A reserved word costs nothing; that costs trust.
 *
 * @returns never; it always redirects.
 */
export default async function FursonasRedirect({
  params,
}: {
  params: Promise<{ locale: string; rest?: string[] }>;
}) {
  const { locale, rest } = await params;
  redirect({
    href: `/pages${rest?.length ? `/${rest.join("/")}` : ""}`,
    locale,
  });
}
