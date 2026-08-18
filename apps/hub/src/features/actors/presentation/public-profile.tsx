import type { ReactNode } from "react";
import { tid } from "@/shared/infrastructure/test-id";
import { isMachineHandle } from "@/features/actors/domain/actor-content";
import type { PublicActor } from "@/features/actors/infrastructure/public-actors";
import { FursonaCardList } from "@/features/actors/presentation/fursona-card-list";
import { PublicBlocks } from "@/features/actors/presentation/blocks";

/**
 * What {@link PublicProfile} needs.
 *
 * The two label props are both resolved by the route, because this renders on
 * both public pages and neither of them knows the locale by itself.
 *
 * `themeSwitch` joins them for the same reason and is optional for a different
 * one: only the route knows whether there is a theme to leave.
 *
 * `parentHost` joins them too, for a third reason: it is not locale or theme
 * data at all but deployment configuration (`env.hubHost`), which a
 * presentation component has no way to read for itself without every route
 * that renders it losing the ability to test the rendering in isolation.
 *
 * What the actor carries as its page is a TREE of blocks — see
 * {@link PublicActor} — and this component hands it whole to
 * {@link PublicBlocks} without reading into it. Nothing here decides how a page
 * is arranged, which is what keeps one renderer serving both public pages.
 */
export interface PublicProfileProps {
  /** The actor to render — a person or one of their fursonas. */
  actor: PublicActor;
  /** The locale being read. */
  locale: string;
  /** Heading above the fursona list, when there is one. */
  fursonasTitle: string;
  /**
   * This deployment's own hostname, threaded to {@link PublicBlocks} for
   * Twitch's `parent=`. Resolved by the route from `env.hubHost`; empty means
   * Twitch resolves to nothing and renders as a link. See
   * `PublicBlocksProps.parentHost` and `domain/embeds.ts`.
   */
  parentHost: string;
  /**
   * What a visitor reads when the page carries nothing at all.
   *
   * **Addressed to the VISITOR, not the owner.** This is an anonymous read and
   * the page cannot know who is looking, so it must not tell somebody to go and
   * write something — most people who see it are not the person who could.
   */
  emptyMessage: string;

  /**
   * The control that leaves the owner's theme, rendered on the header's row.
   *
   * **A slot rather than something this component builds**, because it is a
   * client component and both routes already resolve their own labels — and
   * because only the route knows whether there is a theme to leave. Absent is
   * the ordinary case: an unthemed page offers no way out of a theme it does
   * not have.
   *
   * It belongs on this row rather than above it. Alone at the top of the page
   * it read as something the page was missing a heading for, and it pushed the
   * portrait — the thing a visitor is here to look at — a control's height
   * further down. Level with the picture it is plainly one of the page's
   * furniture rather than part of what its owner wrote.
   */
  themeSwitch?: ReactNode;
}

/**
 * One actor's public page.
 *
 * **The same component renders both pages**, which is what makes "a person's
 * profile has the same shape as a fursona's" true rather than merely intended.
 * The only difference is the list: `readPublicPerson` supplies one and
 * `readPublicFursona` does not, so a fursona's page simply has nothing to draw
 * there.
 *
 * **The provisioned handle never reaches the page.** A person is minted with
 * `u-<actor_ref with the hyphens out>`, and this printed it under their name —
 * so a stranger reading a profile was handed the reference that is the
 * `owner_ref` of every fursona that person owns, the exact column
 * `/api/actors/mine` strips by name. `isMachineHandle` catches it, and their
 * ADDRESS stands in: it is what the visitor typed to arrive, and it is the
 * community number the design calls worth awarding.
 *
 * The heading falls back to the same value when no display name is set, because
 * a page titled with an empty string is worse than one titled with a number —
 * and it leaked through the title as well as the subtitle, so both go through
 * it. A fursona's handle is chosen, is in its address, and shows as before.
 *
 * **A page with nothing on it says so.** Empty means no blocks AND no listed
 * fursonas, since a person who has written nothing but published a character
 * still has a page worth reading. The words are the visitor's, not the
 * owner's — see the prop.
 *
 * Nothing here decides what may be shown. Visibility, suspension and the
 * public-only fursona list are all settled in `0012`, and re-deriving any of
 * them in a component would be a second copy free to drift from the one the
 * database enforces.
 *
 * Exposes the `public-actor-name` test id. The signed-in end-to-end suite
 * asserts on it after creating a fursona — its text is the person's own words,
 * not a translated string, so checking it is meaningful in either language.
 *
 * The header carries real weight and a rule beneath it. This is the page a
 * stranger judges somebody by, and a name at the same size as a section
 * heading gives them nowhere to look first.
 *
 * **The theme switch rides that header rather than sitting above it.** It is a
 * slot — see the prop — and it is level with the portrait, which is what makes
 * it read as the page's furniture rather than as something its owner put
 * there. The row wraps on a phone, where the three do not share a line.
 *
 * The avatar frame and the empty state are `surface`s, which is how a visitor sees the owner's skin on the page's own furniture.
 *
 * Every colour it paints comes from a token — `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * `parentHost` passes straight through to {@link PublicBlocks} — this
 * component resolves nothing about it, exactly as it resolves neither
 * `locale` nor its two label props. See the prop's own doc.
 *
 * The `<article>` is a grid with no template, so its single track is `auto`.
 * That is safe for the blocks because {@link PublicBlocks} declares its own
 * `minmax(0, 1fr)`; it is not a guarantee this element makes, and the comment
 * at the element says which of its children it does not cover.
 *
 * @returns the page.
 */
export function PublicProfile({
  actor,
  locale,
  fursonasTitle,
  emptyMessage,
  themeSwitch,
  parentHost,
}: PublicProfileProps) {
  // **Never the provisioned handle.** A person is minted with `u-<actor_ref>`,
  // which is that reference in a thin disguise — and on a person it is the
  // `owner_ref` of every fursona they own, the column `/api/actors/mine`
  // strips by name. Their ADDRESS is what belongs here anyway: it is what a
  // stranger typed to arrive, and it is the community number the design says
  // is worth awarding. A fursona's handle is chosen, is in its address, and is
  // shown as before.
  const name = isMachineHandle(actor.handle) ? actor.address : actor.handle;
  // **The fursona list counts as content.** A person may have written no
  // blocks and still have a page worth reading, and hiding their characters
  // behind "nothing here yet" would be worse than the blank screen this
  // replaces. `fursonas` is absent on a fursona's own page and empty on a
  // person's with nothing public, and those mean the same thing here.
  const empty = actor.blocks.length === 0 && !actor.fursonas?.length;
  return (
    // **`grid` with no template, so its single track is `auto`.** That is safe
    // for the blocks — `PublicBlocks` declares `minmax(0, 1fr)` of its own, so
    // its min-content contribution here is zero — and it is NOT a guarantee the
    // other three children have: the header, the empty state and the fursona
    // list are items of this same auto track, and nothing stops one of them
    // widening it. None of them can be wide today (the header wraps, the
    // others are text), which is why this is a note rather than a change.
    <article className="grid gap-8">
      {/* Wraps, because on a phone the portrait, the name and the theme switch
          do not share a line — and the name is what gives way, since it is the
          only one of the three that reads perfectly well on its own row. */}
      <header className="flex flex-wrap items-center gap-4 border-b border-(--edge)/40 pb-8 sm:gap-5">
        {actor.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
          <img
            src={actor.avatarUrl}
            alt=""
            className="size-20 shrink-0 rounded-full surface border-(--edge) object-cover sm:size-24"
          />
        ) : (
          <span className="size-20 shrink-0 rounded-full surface border-dashed border-(--edge) sm:size-24" />
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <h1
            className="font-display text-3xl font-extrabold tracking-tight wrap-break-word sm:text-4xl"
            {...tid("public-actor-name")}
          >
            {actor.displayName ?? name}
          </h1>
          <p className="font-mono text-sm text-(--muted)">{name}</p>
        </div>
        {themeSwitch ? (
          <div className="shrink-0" {...tid("public-theme-switch")}>
            {themeSwitch}
          </div>
        ) : null}
      </header>

      <PublicBlocks
        blocks={actor.blocks}
        locale={locale}
        parentHost={parentHost}
      />

      {/* Without this a published-but-empty page was a screen of gradient and
          nothing else: a visitor could not tell it from one that failed to
          load, and its owner could not tell that publishing had worked. */}
      {empty ? (
        <p
          {...tid("public-empty")}
          className="rounded-xl surface border-dashed border-(--edge)/60 px-6 py-12 text-center text-sm text-(--muted)"
        >
          {emptyMessage}
        </p>
      ) : null}

      {actor.fursonas ? (
        <FursonaCardList
          address={actor.address}
          fursonas={actor.fursonas}
          title={fursonasTitle}
        />
      ) : null}
    </article>
  );
}
