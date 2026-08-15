import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import { PageShell } from "@/shared/presentation/page-shell";
import {
  PublicProfile,
  ThemeScope,
  isCustomised,
  readPublicPerson,
} from "@/features/actors";

/**
 * Metadata for a person's public profile.
 *
 * **It names nothing when there is nothing to show.** A 404's metadata is the
 * leak nobody looks for: putting the address in the title would confirm which
 * addresses exist to anyone reading a tab, a share preview or a server log,
 * which is the same existence oracle the page body is careful to avoid.
 *
 * `robots` refuses indexing for an **unlisted** profile. Without that, the link
 * somebody chose not to publish ends up in a search result and "unlisted" means
 * nothing.
 *
 * The canonical address is the one the database reports — the vanity when there
 * is one, else the number. Both keep resolving, so without this a profile
 * accumulates two indexed URLs for the same page.
 *
 * @returns the page's metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; person: string }>;
}): Promise<Metadata> {
  const { locale, person } = await params;
  const actor = await readPublicPerson(person);
  if (!actor) {
    const t = await getTranslations({ locale, namespace: "publicProfile" });
    return { title: t("notFoundTitle") };
  }

  return {
    title: actor.displayName ?? actor.handle,
    alternates: { canonical: `/${locale}/${actor.address}` },
    robots: actor.listed ? undefined : { index: false, follow: false },
  };
}

/**
 * A person's public profile, at `/{address}`.
 *
 * Reachable by anybody. Which profiles exist and what they show is settled by
 * `public_person` in `0012`; nothing here re-derives it.
 *
 * **Every hidden state answers the same way.** Private, suspended, deleted, and
 * never-registered all arrive as no row, and all of them `notFound()`. A
 * distinguishable response would let anybody test whether an address is taken,
 * from a page with no session and no rate limit in front of it.
 *
 * It no longer calls `setRequestLocale`: next-intl reads the segment from `next/root-params` now. It still takes `params` for the address itself.
 *
 * @returns the profile, or a 404.
 * The page is wrapped in `ThemeScope`, so a stranger sees it as its owner built
 * it. That sets only the accent and the cloud tints — light and dark stay under
 * the visitor's own toggle, so somebody who needs a dark page gets one wearing
 * the owner's colours rather than instead of them.
 *
 * **A profile with nothing on it says so** rather than rendering a screen of
 * empty gradient. The words come from this route, since the component cannot
 * resolve a locale, and they are addressed to the visitor rather than to the
 * owner — this is an anonymous read and the page has no idea who is looking.
 *
 * **The shell is told the page is themed**, because the light/dark toggle
 * cannot see a theme — it arrives as a `<style>` this page emits. On a themed
 * page neither light nor dark is in force, so the toggle shows a question mark
 * rather than a sun or a moon naming a state the page is not in.
 *
 * A visitor may leave the theme: `PageThemeSwitch` offers the owner's colours
 * and each of the app's two defaults, handed to `PublicProfile` so it sits on
 * the header's row level with the portrait rather than alone above the page.
 * It renders only where there is a theme to leave — which it asks as `isCustomised`, not `isThemed`. A page
 * whose owner chose only a skin, a canvas or a cursor has no colour of its own
 * and is still unmistakably theirs, so the narrower question would have hidden
 * the way out of exactly the pages hardest to read. That control existing is what lets an author's colours be as
 * unreadable as they like without it being anybody else's problem.
 *
 */
export default async function PublicPersonPage({
  params,
}: {
  params: Promise<{ locale: string; person: string }>;
}) {
  const { locale, person } = await params;
  const actor = await readPublicPerson(person);
  if (!actor) notFound();

  const t = await getTranslations("publicProfile");

  return (
    // The toggle needs to know: on a themed page neither light nor dark is in
    // force, so its sun or moon would name a state the page is not in.
    <PageShell themed={isCustomised(actor.theme)} width="wide">
      <ThemeScope theme={actor.theme}>
        <PublicProfile
          actor={actor}
          locale={locale}
          fursonasTitle={t("fursonas")}
          emptyMessage={t("empty")}
          // Rendered on the header's own row rather than above the page.
          // Alone at the top it read as a heading's worth of furniture nobody
          // had written a heading for, and it pushed the portrait down by its
          // own height. Only where there is a theme to leave: a control
          // offering to remove colours a page never had does nothing.
          themeSwitch={
            isCustomised(actor.theme) ? (
              <PageThemeSwitch
                labels={{
                  title: t("pageThemeTitle"),
                  author: t("pageThemeAuthor"),
                  light: t("pageThemeLight"),
                  dark: t("pageThemeDark"),
                }}
              />
            ) : null
          }
        />
      </ThemeScope>
    </PageShell>
  );
}
