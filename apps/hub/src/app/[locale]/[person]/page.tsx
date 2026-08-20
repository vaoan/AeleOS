import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import { PageShell } from "@/shared/presentation/page-shell";
import { env } from "@/shared/infrastructure/env";
import {
  PublicProfile,
  publicName,
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
 * @returns the page's metadata. *
 * **The title is never the provisioned handle.** A person who chose no display
 * name carries `u-` plus their `actor_ref`, and this once put that reference in
 * the tab, in history and in every screenshot of a page open to strangers.
 * {@link publicName} is what decides, so no caller has to remember the guard.
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
    title: publicName(actor),
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
 *
 * **The shell is no longer told the page is themed.** Passing the palette
 * switch at all is that statement now — the light/dark toggle stopped needing
 * to know when its question mark went, so the boolean beside the slot was
 * saying the same thing twice.
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
 * **This route builds the `PageContext`**, resolving `parentHost` from
 * `env.hubHost`, the same way it
 * resolves `locale` and the empty-state words: `PublicProfile` and
 * `PublicBlocks` are presentation components rendered on two different
 * routes, and neither is where deployment configuration belongs. Twitch's
 * player is the one thing that reads it — see `domain/embeds.ts`.
 *
 * **The theme switch is in the BAR now**, not on the page. It rode the
 * profile's header until that header became blocks; a control belonging to
 * the app is exactly what should not sit among an author's content. The
 * empty-state message is gone with it — every page renders a portrait and a
 * handle, so the state it described cannot occur.
 *
 * **The shell is asked for a FULL-WIDTH main.** The measure is applied to
 * each top-level section instead, which is what lets one of them reach both
 * edges without `w-screen`. See `PublicBlocks`.
 *
 * This sentence was here before the code was: the route asked for `"wide"`
 * and `COLUMN.full` had no caller at all, so every page was laid inside a
 * centred `max-w-7xl` column — a second gutter inside the page's own, the two
 * widest measures capped at 80rem, and a bleeding section reaching neither
 * edge. `page-measure-and-bleed.spec.ts` is what makes the claim checkable
 * rather than merely written down.
 *
 * **The same object carries what the identity leaves render from**: the
 * handle, the address, the display name, the portrait and the fursona list.
 * A person's page carries `fursonas` and no `owner`.
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
  // The control lives in the BAR now, so its label lives with the bar\'s.
  const tControls = await getTranslations("controls");

  return (
    <PageShell
      // **Full, because the measure is the SECTION's to apply.** A column here
      // would cap the two widest stops at its own `max-w-7xl`, add a second
      // gutter inside the page's own, and leave a bleeding section unable to
      // reach either edge.
      width="full"
      // In the bar with the other page settings. It rode the profile's
      // header until that header became blocks.
      pageThemeSwitch={
        isCustomised(actor.theme) ? (
          <PageThemeSwitch
            labels={{
              author: tControls("authorTheme"),
            }}
          />
        ) : null
      }
    >
      <ThemeScope theme={actor.theme}>
        <PublicProfile
          actor={actor}
          locale={locale}
          // Everything page-level the identity leaves render from, plus the
          // deployment's own hostname for Twitch's `parent=`. A person's page
          // carries `fursonas` and no `owner`; a fursona's is the reverse.
          page={{
            parentHost: env.hubHost,
            actorKind: "person",
            handle: actor.handle,
            address: actor.address,
            displayName: actor.displayName,
            avatarUrl: actor.avatarUrl,
            fursonas: actor.fursonas,
            // The block's own title wins; this is what one with none shows.
            measure: actor.theme.measure,
            fursonasFallbackTitle: t("fursonas"),
          }}
        />
      </ThemeScope>
    </PageShell>
  );
}
