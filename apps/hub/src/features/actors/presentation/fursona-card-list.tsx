import { Link } from "@/shared/infrastructure/i18n/navigation";
import type { PublicFursonaSummary } from "@/features/actors/infrastructure/public-actors";

/** What {@link FursonaCardList} needs. */
export interface FursonaCardListProps {
  /** The owner's address, which is the first segment of each link. */
  address: string;
  /**
   * The fursonas to show.
   *
   * **Only the public ones ever reach here.** `public_person` in `0012` applies
   * that filter, and this component deliberately does not re-derive it — a
   * second copy of a visibility rule is how one of them drifts. If an unlisted
   * fursona ever appears on a profile, the bug is in the function, not here.
   */
  fursonas: PublicFursonaSummary[];
  /** Heading above the list. */
  title: string;
}

/**
 * The characters a person has published, each linking to its own page.
 *
 * Renders **nothing at all** when there are none, rather than a heading over an
 * empty space. Somebody with no public fursonas has a profile about themselves,
 * not a profile with a gap in it.
 *
 * Each card is a `surface`; that class is what a skin styles, and swapping it back for `border` would leave them wearing no skin at all.
 *
 * Every colour it paints comes from a token — `--edge`, `--muted`, `--surface` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the list, or null.
 */
export function FursonaCardList({
  address,
  fursonas,
  title,
}: FursonaCardListProps) {
  if (fursonas.length === 0) return null;

  return (
    <section className="grid gap-3">
      <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {fursonas.map((fursona) => (
          <li key={fursona.handle}>
            <Link
              href={`/${address}/${fursona.handle}`}
              className="flex items-center gap-3 rounded-xl surface border-(--edge) bg-(--surface) p-3"
            >
              {fursona.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
                <img
                  src={fursona.avatarUrl}
                  alt=""
                  className="size-12 shrink-0 rounded-full surface border-(--edge) object-cover"
                />
              ) : (
                <span className="size-12 shrink-0 rounded-full surface border-dashed border-(--edge)" />
              )}
              <span className="grid">
                <span className="font-display text-sm font-bold">
                  {fursona.displayName ?? fursona.handle}
                </span>
                <span className="font-mono text-xs text-(--muted)">
                  {fursona.handle}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
