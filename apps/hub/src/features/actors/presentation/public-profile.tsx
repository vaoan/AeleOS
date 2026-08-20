import {
  PublicBlocks,
  type PageContext,
} from "@/features/actors/presentation/blocks";
import type { PublicActor } from "@/features/actors/infrastructure/public-actors";

/**
 * What {@link PublicProfile} needs.
 *
 * **Almost nothing, now that the page is entirely blocks.** This carried an
 * avatar, a name, a handle, a fursona list, an empty-state message and a theme
 * switch when those were chrome the app rendered around somebody's content.
 * Every one of them is either a block its owner arranges or a control in the
 * page bar, so what is left is the actor's tree and the two things a
 * presentation component cannot resolve for itself.
 */
export interface PublicProfileProps {
  /** The actor to render — a person or one of their fursonas. */
  actor: PublicActor;
  /** The locale being read. */
  locale: string;
  /**
   * Everything page-level the blocks render from, resolved by the route.
   *
   * See `PageContext`. It carries the deployment's hostname for Twitch and the
   * actor's own identity for the identity leaves; this component reads no
   * field of it.
   */
  page: PageContext;
}

/**
 * One actor's public page.
 *
 * **There is no longer any such thing as page furniture the app owns.** The
 * portrait, the display name, the handle, the owner link and the fursona list
 * were hard-coded here, above and below the blocks, and could not be moved,
 * resized, styled or repeated. They are leaf kinds now — see
 * `presentation/identity-leaves.tsx` — so the whole page is one tree its owner
 * arranges, and this component hands that tree straight to
 * {@link PublicBlocks} without reading into it.
 *
 * That is what makes "a person's profile has the same shape as a fursona's"
 * true rather than merely intended: there is no shape left here to differ.
 *
 * **The empty state is GONE, and its condition could no longer be true.** It
 * existed because a published-but-blank page was a screen of gradient and
 * nothing else — a visitor could not tell it from one that failed to load.
 * Every page now renders at least a portrait and a handle, because
 * `withRequiredBlocks` supplies them when the stored page names none. The
 * alternative was to redefine "empty" as "nothing beyond the required blocks",
 * which would tell a visitor "there is nothing here" about a page that plainly
 * has somebody's name and face on it. Worse than silence.
 *
 * **The theme switch is gone from here too**, into the page bar with the other
 * page settings. It rode this component's header because that was the one row
 * the app owned inside somebody's content; there is no such row any more, and
 * a control belonging to the app is exactly what should not sit among an
 * author's blocks.
 *
 * Nothing here decides what may be shown. Visibility, suspension and the
 * public-only fursona list are settled in `0012`, and re-deriving any of them
 * in a component would be a second copy free to drift from the one the
 * database enforces.
 *
 * @returns the page.
 */
export function PublicProfile({ actor, locale, page }: PublicProfileProps) {
  return <PublicBlocks blocks={actor.blocks} locale={locale} page={page} />;
}
