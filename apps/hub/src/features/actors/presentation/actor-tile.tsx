import type { Actor } from "@/features/actors/infrastructure/fursonas";
import { Link } from "@/shared/infrastructure/i18n/navigation";

/**
 * What {@link ActorTile} needs to render one actor, and the two optional
 * affordances a caller may attach to it: an edit link, and — for the picker —
 * a submit button that hands this actor back as the choice.
 */
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

  /**
   * Renders this tile as a choice: a submit button carrying the actor's
   * `actor_ref` as its own name/value pair.
   *
   * **Only meaningful inside a form**, because that is the only place a submit
   * button means anything. It exists because a `ul` may contain nothing but
   * `li`, so a form cannot wrap one tile — HTML's own answer to "which of these
   * did you click" is several submit buttons in one form, each naming the same
   * field with a different value, and that is what this renders.
   *
   * The label is expected to name the actor, so a list of them is still
   * distinguishable when read out one button at a time.
   *
   * Absent for an actor the caller must not be able to pick. Offering the
   * button for one the server will refuse only moves the refusal later.
   */
  choose?: { label: string };
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
 * `choose` turns the same tile into a pickable option for the picker, rather
 * than the picker growing a second, near-identical tile that would then have
 * to be kept in step with this one. The submitted field is `actor_ref`, which
 * is the actor model's own name for the value — the same one `my_actors()`
 * returns and the same one the picker hands back to the calling app.
 *
 * The tile is a `surface`, which is what makes it follow a skin's radius, edge and shadow.
 *
 * Every colour it paints comes from a token — `--accent`, `--bar`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its avatar is a plain `img`, and the disable above it now says why: the address is arbitrary and typed by hand, so `next/image` would try to optimise a host it has never been configured for. It carried no reason at all before, which is how a considered exception becomes indistinguishable from a silenced warning.
 *
 * @returns the tile.
 */
export function ActorTile({
  actor,
  youLabel,
  visibilityLabel,
  edit,
  choose,
}: ActorTileProps) {
  return (
    <li className="flex items-center gap-4 rounded-xl surface border-(--edge)/40 p-4">
      {actor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the address is arbitrary and typed by hand, so next/image would try to optimise a host it has never been configured for.
        <img
          src={actor.avatarUrl}
          alt=""
          className="size-12 rounded-full object-cover ring-2 ring-(--ring)"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-12 rounded-full bg-(--bar) ring-2 ring-(--ring)"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {actor.displayName ?? actor.handle}
        </span>
        <span className="block truncate text-sm text-(--muted)">
          @{actor.handle}
        </span>
      </span>
      <span className="text-xs text-(--muted)">
        {actor.kind === "person" ? youLabel : visibilityLabel}
      </span>
      {actor.kind === "fursona" && edit ? (
        <Link href={edit.href} className="text-sm underline">
          {edit.label}
        </Link>
      ) : null}
      {choose ? (
        <button
          type="submit"
          name="actor_ref"
          value={actor.actorRef}
          className="shrink-0 rounded-lg bg-(--accent) px-3 py-1.5 text-sm font-medium text-(--on-accent)"
        >
          {choose.label}
        </button>
      ) : null}
    </li>
  );
}
