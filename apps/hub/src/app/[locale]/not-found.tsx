import { getTranslations } from "next-intl/server";
import { Card, PageShell } from "@/shared/presentation/page-shell";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";

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
 * **It now catches most anonymous 404s too, which it did not use to.** This
 * note used to say an anonymous visitor to a mistyped path was 307'd to
 * sign-in, because the auth gate classified anything unrecognised as protected,
 * and that fixing it needed a catch-all segment nobody wanted. The public actor
 * pages supplied one by accident: `[locale]/[person]` and
 * `[locale]/[person]/[handle]` match any one- or two-segment path that is not a
 * reserved word, so `/es/typo` reaches a real route, finds no such address and
 * renders **this** page. `tests/e2e/public-pages.spec.ts` asserts exactly that.
 *
 * What still escapes it: a path of three or more segments, an uppercase first
 * segment (an address is lowercase by construction), and an unknown locale —
 * all of which resolve above this segment where no locale has been negotiated,
 * and all of which an anonymous visitor still meets as a sign-in redirect (see
 * `tests/e2e/auth.spec.ts`).
 *
 * Exposes the `not-found-title` and `not-found-home` test ids. They exist
 * because the public actor pages made this page reachable anonymously for the
 * first time — before that no end-to-end test could get here at all.
 *
 * Its card carries `surface`, the class skins style, so a themed 404 wears the same form as the pages around it.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its focus ring names a width and a colour but **no offset**, so it takes the
 * inset one `@utility surface` sets. Naming an offset here would win on
 * specificity and leave this one control ringed outside its edge while every
 * other surface in the app is ringed inside.
 *
 * @returns the not-found page.
 */
export default async function NotFoundPage() {
  const t = await getTranslations("notFound");

  return (
    <PageShell>
      <Card>
        <section className="flex flex-col items-start gap-4">
          <h1
            className="font-display text-2xl font-bold tracking-tight"
            {...tid("not-found-title")}
          >
            {t("title")}
          </h1>
          <p className="text-sm text-(--ink-2)">{t("body")}</p>
          <Link
            href="/"
            {...tid("not-found-home")}
            className="rounded-lg surface border-(--edge) px-4 py-2 text-sm transition-colors hover:bg-(--edge)/15 focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            {t("home")}
          </Link>
        </section>
      </Card>
    </PageShell>
  );
}
