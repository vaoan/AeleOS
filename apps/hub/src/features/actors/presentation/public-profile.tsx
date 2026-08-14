import { tid } from "@/shared/infrastructure/test-id";
import type { PublicActor } from "@/features/actors/infrastructure/public-actors";
import { FursonaCardList } from "@/features/actors/presentation/fursona-card-list";
import { PublicSections } from "@/features/actors/presentation/public-sections";

/** What {@link PublicProfile} needs. */
export interface PublicProfileProps {
  /** The actor to render — a person or one of their fursonas. */
  actor: PublicActor;
  /** The locale being read. */
  locale: string;
  /** Heading above the fursona list, when there is one. */
  fursonasTitle: string;
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
 * The heading falls back to the handle when no display name is set, because a
 * page titled with an empty string is worse than one titled with a machine
 * name — and every fursona has a handle by construction.
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
}: PublicProfileProps) {
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
            {actor.displayName ?? actor.handle}
          </h1>
          <p className="font-mono text-sm text-[var(--muted)]">
            {actor.handle}
          </p>
        </div>
      </header>

      <PublicSections sections={actor.sections} locale={locale} />

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
