import { getTranslations } from "next-intl/server";
import { Card, PageShell } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";

/**
 * The 404 page for anything under a locale segment.
 *
 * It exists because this app calls `notFound()` for real: the edit route 404s a
 * handle the caller does not own, one that does not exist, and one whose
 * fursona is suspended — so an owner following a bookmark to a sanctioned
 * fursona lands here. Next's built-in fallback is English-only, unstyled and
 * rendered outside every layout, which in a bilingual app with a shipped visual
 * identity reads as a broken deployment rather than a missing page.
 *
 * It brings its own {@link PageShell}. Next renders a `not-found` file inside
 * the layouts *above* it, and the shell lives in the `(app)` group below this
 * segment — so without this the page would arrive with no header, no controls
 * and no field behind it.
 *
 * Deliberately vague about *why*: the same 404 answers "no such handle",
 * "not yours" and "suspended", exactly as `update_fursona` raises one error for
 * all three. Naming which one applied would turn the page into an oracle for
 * probing whose handles exist.
 *
 * **It does not catch every 404.** A path that matches no route at all — and an
 * unknown locale, which `[locale]/layout.tsx` rejects from the layout itself —
 * resolves above this segment, where no locale has been negotiated. What an
 * anonymous visitor gets there is not a 404 at all: the auth gate runs before
 * the locale layout and classifies the path as protected, so it 307s to
 * `/es/sign-in` before this page or the layout's `notFound()` is ever reached
 * (see `tests/e2e/auth.spec.ts`). Only a signed-in visitor falls through to
 * Next's root `/_not-found`. Fixing the anonymous case needs a catch-all route
 * segment, which would also swallow genuine routing mistakes during
 * development; the in-app case is the one this branch created.
 *
 * @returns the not-found page.
 */
export default async function NotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <PageShell>
      <Card>
        <section className="flex flex-col items-start gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--ink-2)]">{t("body")}</p>
          <Link
            href="/"
            className="rounded-lg border border-[var(--edge)] px-4 py-2 text-sm transition-colors hover:bg-[var(--edge)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {t("home")}
          </Link>
        </section>
      </Card>
    </PageShell>
  );
}
