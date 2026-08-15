"use client";

import { useState } from "react";
import { GripVertical, Pencil, Star, Trash2 } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";
import { cn } from "@/shared/infrastructure/cn";
import type { Visibility } from "@/features/actors/domain/fursona-schema";

/**
 * Translated strings {@link FursonaRow} renders.
 *
 * `viewPublic` names the link out to the page a stranger would see. It is a
 * title rather than visible text because the control is an icon in a dense row,
 * and a row of five words would push the actor's own name out of view.
 */
export interface FursonaRowLabels {
  /** Marks the person's own row. */
  you: string;
  /** The edit link. */
  edit: string;
  /** Pins a fursona first. */
  pin: string;
  /** Removes the pin. */
  unpin: string;
  /** Opens the delete confirmation. */
  remove: string;
  /** Confirms the delete. */
  confirm: string;
  /** Dismisses the delete confirmation. */
  cancel: string;
  /** Names the drag handle for a screen reader. */
  dragToReorder: string;
  /** One label per visibility value. */
  visibility: Record<Visibility, string>;
  /** Names the link out to the page a stranger would see. */
  viewPublic: string;
}

/** The actor shape a row renders. */
export interface FursonaRowActor {
  /** The platform ID, passed back to the callbacks. */
  actorRef: string;
  /** Person rows render as the "you" row and carry no actions. */
  kind: "person" | "fursona";
  /** The handle, shown with a leading at-sign. */
  handle: string;
  /** The chosen name, when there is one. */
  displayName: string | null;
  /** An avatar image, when there is one. */
  avatarUrl: string | null;
  /** Who can see it. */
  visibility: Visibility;
  /** Moderation state. */
  status: "active" | "suspended" | "deleted";
}

/**
 * What {@link FursonaRow} needs.
 *
 * `address` is optional because a row cannot assume its caller fetched one, and
 * a row without it simply offers no link rather than guessing an address.
 */
export interface FursonaRowProps {
  /**
   * The owner's public address, when they have one.
   *
   * Optional because this component cannot assume its caller fetched it, and a
   * row without it simply offers no link rather than guessing an address.
   */
  address?: string;
  /** The actor to render. */
  actor: FursonaRowActor;
  /** Already-translated strings. */
  labels: FursonaRowLabels;
  /** Whether this fursona is pinned first. */
  featured: boolean;
  /** False while the list is filtered, when reordering has no meaning. */
  canArrange: boolean;
  /** Called with the actor ref and the pin state being asked for. */
  onPin: (actorRef: string, featured: boolean) => void;
  /** Called with the actor ref once a delete is confirmed. */
  onDelete: (actorRef: string) => void;
}

/**
 * One row in the fursona list.
 *
 * A separate component from `ActorTile` rather than a variant of it. The tile
 * still serves the picker, and making one component answer to two layouts is
 * how both stop being right — this happens to show the same actor, and that is
 * all they share.
 *
 * **The person row carries no actions.** It is the account rather than a
 * character, so offering delete on it would be offering to delete the person.
 *
 * Delete opens an inline confirmation rather than acting at once, and rather
 * than a browser `confirm()`: the destructive step is the second click, and it
 * stays inside the row so it is obvious which fursona is about to go.
 *
 * A row in a table, not a card of its own: the container owns the edge, and
 * rows are separated by a hairline and an alternating tint. That tint is
 * `--bar` over `--surface`, a background `check:contrast` now measures — a
 * stripe that bought hierarchy by costing legibility would be a bad trade.
 *
 * **It links to the public page only where there is one to see.** A `private`
 * actor answers 404 to everybody, its owner included, so the link is offered
 * for `public` and `unlisted` alone — `unlisted` because it serves to whoever
 * holds the link, and its owner is exactly who does. A link that 404s teaches
 * somebody the feature is broken rather than that their page is unpublished.
 *
 * The link carries a test id keyed by handle, because a list holds one per row
 * and an end-to-end test has to name the row it just created — the suite runs
 * in Spanish and may not reach it by its label.
 *
 * **The person's row carries an edit link and nothing else.** Their page is
 * edited in the same editor a fursona's is, but the three controls beside it
 * are not theirs to have: nothing to pin when the row is always first, nothing
 * to reorder against, and no retiring yourself.
 *
 * The row and its avatar frame are `surface`s — the class skins style, and the reason a row's edge changes with the theme.
 *
 * Every colour it paints comes from a token — `--accent`, `--bar`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the row.
 */
export function FursonaRow({
  address,
  actor,
  labels,
  featured,
  canArrange,
  onPin,
  onDelete,
}: FursonaRowProps) {
  const [confirming, setConfirming] = useState(false);
  const isPerson = actor.kind === "person";
  // A person's own profile is at their address; a fursona's is that address
  // followed by its handle. Neither is worth linking to when it will 404.
  const publicHref =
    address && actor.visibility !== "private"
      ? isPerson
        ? `/${address}`
        : `/${address}/${actor.handle}`
      : null;

  return (
    // A row in a table, not a card of its own. Every row carrying its own
    // border and radius gave a list of twenty the same visual weight twenty
    // times over and no hierarchy at all — the container owns the edge now, and
    // rows are separated by a hairline and an alternating tint.
    <li className="flex items-center gap-3 border-b border-(--edge)/25 px-4 py-3 last:border-b-0 even:bg-(--bar)">
      {canArrange && !isPerson ? (
        <button
          type="button"
          aria-label={labels.dragToReorder}
          className="cursor-grab text-(--muted)"
        >
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span className="size-4" aria-hidden />
      )}

      {/* A plain `img`, as ActorTile uses: avatarUrl is a URL the person
          supplied, and next/image would need every possible host allowed. */}
      {actor.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={actor.avatarUrl}
          alt=""
          className="size-10 rounded-full object-cover"
        />
      ) : (
        <span className="grid size-10 place-items-center rounded-full bg-(--edge)/40 font-display text-sm">
          {actor.handle.slice(0, 1).toUpperCase()}
        </span>
      )}

      {/* The person row shows neither a handle nor a visibility badge. Its
          handle is `u-` followed by 32 hex digits — a machine string the hub
          provisions and offers no way to change — and docs/integrating.md tells
          every consuming app not to render it as a username. The same applies
          here. Its visibility is not a choice anybody made either. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {isPerson ? labels.you : (actor.displayName ?? actor.handle)}
        </span>
        {isPerson ? null : (
          <span className="block truncate font-mono text-xs text-(--muted)">
            @{actor.handle}
          </span>
        )}
      </span>

      {isPerson ? null : (
        <span className="rounded-full surface border-(--edge) px-2 py-0.5 text-xs text-(--muted)">
          {labels.visibility[actor.visibility]}
        </span>
      )}

      {/* **Only where there is a page to see.** A `private` actor answers 404
          to everybody, its owner included, so a link would send somebody to a
          dead end and teach them the feature is broken. `unlisted` is offered:
          it serves to whoever holds the link, and its owner is exactly who
          does. The link needs the address too, which a person always has —
          assigned by trigger — but which this component cannot assume it was
          given. */}
      {publicHref ? (
        <Link
          href={publicHref}
          target="_blank"
          rel="noreferrer"
          aria-label={`${labels.viewPublic}: ${actor.displayName ?? actor.handle}`}
          title={labels.viewPublic}
          // Keyed by handle, because a list has one of these per row and an
          // end-to-end test needs to name the row it just created. The suite
          // runs in Spanish and may not assert on a translated label, so a test
          // id is the only way to reach this at all.
          {...tid(`view-public-${actor.handle}`)}
          className="rounded-lg surface border-(--edge) px-2 py-1 text-(--muted)"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      ) : null}

      {/* **The person gets an edit link and nothing else.** Their page is edited
          in the same editor a fursona's is — the fields are identical — but the
          three controls beside it are not theirs to have: there is nothing to
          pin when the row is always first, nothing to reorder against, and no
          retiring yourself. Each follows from what a person actor is rather
          than from a rule invented here. */}
      {isPerson ? (
        <Link
          href="/me/edit"
          aria-label={labels.edit}
          {...tid("edit-my-profile")}
          className="rounded-lg p-1.5 text-(--muted)"
        >
          <Pencil className="size-4" />
        </Link>
      ) : confirming ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(actor.actorRef)}
            className="rounded-lg bg-(--accent) px-2.5 py-1 text-xs font-medium text-(--on-accent)"
          >
            {labels.confirm}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2.5 py-1 text-xs text-(--muted)"
          >
            {labels.cancel}
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label={featured ? labels.unpin : labels.pin}
            aria-pressed={featured}
            onClick={() => onPin(actor.actorRef, !featured)}
            className={cn(
              "rounded-lg p-1.5",
              featured ? "text-(--star)" : "text-(--muted)",
            )}
          >
            <Star className="size-4" />
          </button>
          <Link
            href={`/pages/${actor.handle}/edit`}
            aria-label={labels.edit}
            className="rounded-lg p-1.5 text-(--muted)"
          >
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            aria-label={labels.remove}
            onClick={() => setConfirming(true)}
            className="rounded-lg p-1.5 text-(--muted)"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      )}
    </li>
  );
}
