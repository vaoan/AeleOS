import { auth } from "@clerk/nextjs/server";
import { redirect } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/page-shell";
import { UserMenu } from "@/components/user-menu";

/**
 * The shell for signed-in pages.
 *
 * **This layout protects.** It calls `auth.protect()` itself rather than
 * trusting the proxy, so a session is required by the resource and not only by
 * a path pattern.
 *
 * That is deliberate defence in depth, and Clerk's own reasoning for
 * deprecating `createRouteMatcher`: middleware matching can diverge from how
 * Next actually routes a request, leaving a protected resource reachable. This
 * repository has already seen that divergence — adding a `[locale]` segment
 * changed every path, and `PUBLIC_ROUTES` had to be widened to match. A route
 * the matcher misses is still protected here.
 *
 * The proxy check stays as the outer gate, because it redirects before any
 * rendering happens and keeps the sign-in bounce fast.
 *
 * It redirects to our own sign-in page, in the visitor's language, rather than
 * calling bare `auth.protect()`. That helper falls back to Clerk's hosted
 * Account Portal — measured, by making this route public in the proxy and
 * watching where the fallback sent the request — and nobody may land on a
 * Clerk-branded address.
 *
 * It uses the same `PageShell` as the public pages and adds the user button,
 * so signing in changes what is on the page rather than what the page looks
 * like.
 *
 * @returns the signed-in shell.
 */
export default async function AppLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { userId } = await auth();
  if (!userId) {
    const { locale } = await params;
    redirect({ href: "/sign-in", locale });
  }
  const tNebula = await getTranslations("nebula");

  return (
    <PageShell toggleLabel={tNebula("toggle")} trailing={<UserMenu />}>
      {children}
    </PageShell>
  );
}
