import { tid } from "@/shared/infrastructure/test-id";
import { isMachineHandle } from "@/features/actors/domain/actor-content";
import type { PublicActor } from "@/features/actors/infrastructure/public-actors";
import { FursonaCardList } from "@/features/actors/presentation/fursona-card-list";
import { PublicSections } from "@/features/actors/presentation/public-sections";

/**
 * What {@link PublicProfile} needs.
 *
 * The two label props are both resolved by the route, because this renders on
 * both public pages and neither of them knows the locale by itself.
 */
export interface PublicProfileProps {
  /** The actor to render — a person or one of their fursonas. */
  actor: PublicActor;
  /** The locale being read. */
  locale: string;
  /** Heading above the fursona list, when there is one. */
  fursonasTitle: string;
  /**
   * What a visitor reads when the page carries nothing at all.
   *
   * **Addressed to the VISITOR, not the owner.** This is an anonymous read and
   * the page cannot know who is looking, so it must not tell somebody to go and
   * write something — most people who see it are not the person who could.
   */
  emptyMessage: string;
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
 * **A page with nothing on it says so.** Empty means no sections AND no listed
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
 * @returns the page.
 */
export function PublicProfile({
  actor,
  locale,
  fursonasTitle,
  emptyMessage,
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
  // sections and still have a page worth reading, and hiding their characters
  // behind "nothing here yet" would be worse than the blank screen this
  // replaces. `fursonas` is absent on a fursona's own page and empty on a
  // person's with nothing public, and those mean the same thing here.
  const empty = actor.sections.length === 0 && !actor.fursonas?.length;
  return (
    <article className="grid gap-8">
      <header className="flex items-center gap-5 border-b border-[var(--edge)]/40 pb-8">
        {actor.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
          <img
            src={actor.avatarUrl}
            alt=""
            className="size-24 shrink-0 rounded-full border border-[var(--edge)] object-cover"
          />
        ) : (
          <span className="size-24 shrink-0 rounded-full border border-dashed border-[var(--edge)]" />
        )}
        <div className="grid gap-1">
          <h1
            className="font-display text-4xl font-extrabold tracking-tight"
            {...tid("public-actor-name")}
          >
            {actor.displayName ?? name}
          </h1>
          <p className="font-mono text-sm text-[var(--muted)]">{name}</p>
        </div>
      </header>

      <PublicSections sections={actor.sections} locale={locale} />

      {/* Without this a published-but-empty page was a screen of gradient and
          nothing else: a visitor could not tell it from one that failed to
          load, and its owner could not tell that publishing had worked. */}
      {empty ? (
        <p
          {...tid("public-empty")}
          className="rounded-xl border border-dashed border-[var(--edge)]/60 px-6 py-12 text-center text-sm text-[var(--muted)]"
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
