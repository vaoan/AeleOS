import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import { PageShell } from "@/shared/presentation/page-shell";
import { env } from "@/shared/infrastructure/env";
import {
  PublicProfile,
  ThemeScope,
  isCustomised,
  readPublicFursona,
} from "@/features/actors";

/**
 * Metadata for one fursona's page.
 *
 * Same two rules as the profile's, for the same reasons: it names nothing when
 * there is nothing to show, and an **unlisted** fursona refuses indexing — that
 * refusal is the whole difference between `unlisted` and `public`, since an
 * unlisted page is reachable by whoever holds the link and must not arrive in a
 * search result.
 *
 * @returns the page's metadata.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; person: string; handle: string }>;
}): Promise<Metadata> {
  const { locale, person, handle } = await params;
  const actor = await readPublicFursona(person, handle);
  if (!actor) {
    const t = await getTranslations({ locale, namespace: "publicProfile" });
    return { title: t("notFoundTitle") };
  }

  return {
    title: actor.displayName ?? actor.handle,
    alternates: { canonical: `/${locale}/${actor.address}/${actor.handle}` },
    robots: actor.listed ? undefined : { index: false, follow: false },
  };
}

/**
 * One fursona's page, at `/{address}/{handle}`.
 *
 * The handle resolves **within that person only** — handles are unique per
 * owner, so two people's `luna` are two different characters and the address is
 * what tells them apart.
 *
 * Everything hidden answers identically, exactly as on the profile: a private,
 * suspended or deleted fursona, one whose owner is suspended, and one that
 * never existed all `notFound()`.
 *
 * It no longer calls `setRequestLocale`: next-intl reads the segment from `next/root-params` now, so nothing has to be called before a translation is read. It still takes `params`, because the address and the handle are what it looks the page up by.
 *
 * @returns the fursona's page, or a 404.
 * The page is wrapped in `ThemeScope`, so a stranger sees it as its owner built
 * it. That sets only the accent and the cloud tints — light and dark stay under
 * the visitor's own toggle, so somebody who needs a dark page gets one wearing
 * the owner's colours rather than instead of them.
 *
 * **A page with nothing on it says so** rather than rendering a screen of
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
 * **This route resolves `parentHost` from `env.hubHost`**, the same way it
 * resolves `locale` and the empty-state words: `PublicProfile` and
 * `PublicSections` are presentation components rendered on two different
 * routes, and neither is where deployment configuration belongs. Twitch's
 * player is the one thing that reads it — see `domain/embeds.ts`.
 *
 */
export default async function PublicFursonaPage({
  params,
}: {
  params: Promise<{ locale: string; person: string; handle: string }>;
}) {
  const { locale, person, handle } = await params;
  const actor = await readPublicFursona(person, handle);
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
          // Twitch's player needs to know the domain embedding it, which is
          // deployment configuration rather than anything the component could
          // resolve for itself. Empty degrades Twitch to a link.
          parentHost={env.hubHost}
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
