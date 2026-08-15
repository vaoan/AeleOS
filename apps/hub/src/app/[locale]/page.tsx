import { auth } from "@clerk/nextjs/server";
import { getTranslations } from "next-intl/server";
import { Card, PageShell } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";

/**
 * The home page — the only route reachable without a session.
 *
 * Public by way of `PUBLIC_ROUTES`; changing that list is what makes a route
 * reachable signed-out, not anything here.
 *
 * The shell supplies the header and its controls; this page passes nothing to
 * it, because the shell reads its own labels.
 *
 * Exposes the `home-title`, `home-body` and `home-cta` test ids. The end-to-end
 * suite asserts the body rendered and is non-empty rather than what it says,
 * so the copy can change in either language without breaking the suite.
 *
 * Every colour it paints comes from a token — `--accent`, `--on-accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * It takes no `params` at all any more. The locale was only ever threaded in to hand to `setRequestLocale`, and next-intl reads the segment itself now — a page that needs nothing from the URL should say so.
 *
 * @returns the home page.
 */
export default async function HomePage() {
  const t = await getTranslations("home");
  // Resolved on the server rather than with a client-side <Show>: the call to
  // action is the page's whole purpose, and rendering the wrong one first
  // would flash the wrong destination at every visitor.
  const { userId } = await auth();

  return (
    <PageShell>
      <Card>
        <h1
          className="font-display text-3xl font-bold tracking-tight"
          {...tid("home-title")}
        >
          {t("title")}
        </h1>
        <p className="mt-2 text-lg text-(--ink-2)">{t("tagline")}</p>
        <p className="mt-4 text-(--ink-2)" {...tid("home-body")}>
          {t("body")}
        </p>
        <div className="mt-6">
          <Link
            href={userId ? "/me" : "/sign-in"}
            {...tid("home-cta")}
            className="inline-flex rounded-lg bg-(--accent) px-4 py-2 font-medium text-(--on-accent) transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            {userId ? t("goToProfile") : t("signIn")}
          </Link>
        </div>
      </Card>
    </PageShell>
  );
}
