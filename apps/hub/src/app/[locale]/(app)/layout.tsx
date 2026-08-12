import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/page-shell";
import { UserMenu } from "@/components/user-menu";

/**
 * The shell for signed-in pages.
 *
 * Being inside the `(app)` route group carries no protection on its own —
 * `middleware.ts` is what requires a session. This layout only assumes one.
 *
 * It uses the same `PageShell` as the public pages and adds the user button,
 * so signing in changes what is on the page rather than what the page looks
 * like.
 *
 * @returns the signed-in shell.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tNebula = await getTranslations("nebula");

  return (
    <PageShell toggleLabel={tNebula("toggle")} trailing={<UserMenu />}>
      {children}
    </PageShell>
  );
}
