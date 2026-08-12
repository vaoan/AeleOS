import type { Actor } from "@/features/actors/infrastructure/fursonas";
import { Link } from "@/shared/infrastructure/i18n/navigation";

/** What {@link ActorTile} needs to render one actor. */
export interface ActorTileProps {
  /** The actor to show. */
  actor: Actor;
  /** Translated label marking the caller's own person row. */
  youLabel: string;
  /** Translated name of the actor's visibility. */
  visibilityLabel: string;
  /**
   * The edit link's destination and label, as one unit so a link can never
   * render with an href and no accessible name (or vice versa). Absent for a
   * person row and for a fursona the caller should not be offered editing —
   * the caller decides that, this component only renders what it is given.
   */
  edit?: { href: string; label: string };
}

/**
 * One actor, as a tile in the list.
 *
 * Takes translated strings as props rather than calling a translation hook, so
 * the component stays renderable in a test without an i18n provider — the same
 * props-injection rule the shared packages follow.
 *
 * The avatar is a plain `img`: `avatar_url` is a URL the person supplied, and
 * `next/image` would need every possible host in its remote allowlist. The URL
 * is scheme-checked in `fursona-schema` before it is ever stored.
 *
 * The handle is shown with a bare `@` prefix rather than a catalogue key: the
 * symbol reads the same in every language, so it sits in `eslint.config.mjs`'s
 * `i18next/no-literal-string` allowlist beside `AeleOS` and `Furry Colombia`
 * instead of a translated string or a per-callsite suppression.
 *
 * The `edit` prop is a single href/label unit rather than two independent
 * ones, so this component can never render a link with no accessible name.
 * A row with no `edit` gets no edit link at all rather than a disabled one —
 * a disabled control suggests the page exists and is temporarily
 * unavailable, which is not true — and it is the caller's job to decide
 * which rows qualify, not this component's.
 *
 * @returns the tile.
 */
export function ActorTile({
  actor,
  youLabel,
  visibilityLabel,
  edit,
}: ActorTileProps) {
  return (
    <li className="flex items-center gap-4 rounded-xl border border-[var(--edge)]/40 p-4">
      {actor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={actor.avatarUrl}
          alt=""
          className="size-12 rounded-full object-cover ring-2 ring-[var(--ring)]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-12 rounded-full bg-[var(--bar)] ring-2 ring-[var(--ring)]"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {actor.displayName ?? actor.handle}
        </span>
        <span className="block truncate text-sm text-[var(--muted)]">
          @{actor.handle}
        </span>
      </span>
      <span className="text-xs text-[var(--muted)]">
        {actor.kind === "person" ? youLabel : visibilityLabel}
      </span>
      {actor.kind === "fursona" && edit ? (
        <Link href={edit.href} className="text-sm underline">
          {edit.label}
        </Link>
      ) : null}
    </li>
  );
}
