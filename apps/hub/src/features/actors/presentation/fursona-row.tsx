"use client";

import { useState } from "react";
import { GripVertical, Pencil, Star, Trash2 } from "lucide-react";
import { Link } from "@/shared/infrastructure/i18n/navigation";
import { cn } from "@/shared/infrastructure/cn";
import type { Visibility } from "@/features/actors/domain/fursona-schema";

/** Translated strings {@link FursonaRow} renders. */
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

/** What {@link FursonaRow} needs. */
export interface FursonaRowProps {
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
 * @returns the row.
 */
export function FursonaRow({
  actor,
  labels,
  featured,
  canArrange,
  onPin,
  onDelete,
}: FursonaRowProps) {
  const [confirming, setConfirming] = useState(false);
  const isPerson = actor.kind === "person";

  return (
    <li className="flex items-center gap-3 rounded-xl border border-[var(--edge)]/60 bg-[var(--surface)] px-3 py-2.5">
      {canArrange && !isPerson ? (
        <button
          type="button"
          aria-label={labels.dragToReorder}
          className="cursor-grab text-[var(--muted)]"
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
          className="size-8 rounded-full object-cover"
        />
      ) : (
        <span className="grid size-8 place-items-center rounded-full bg-[var(--edge)]/40 font-display text-sm">
          {actor.handle.slice(0, 1).toUpperCase()}
        </span>
      )}

      {/* The person row shows neither a handle nor a visibility badge. Its
          handle is `u-` followed by 32 hex digits — a machine string the hub
          provisions and offers no way to change — and docs/integrating.md tells
          every consuming app not to render it as a username. The same applies
          here. Its visibility is not a choice anybody made either. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {isPerson ? labels.you : (actor.displayName ?? actor.handle)}
        </span>
        {isPerson ? null : (
          <span className="block truncate font-mono text-xs text-[var(--muted)]">
            @{actor.handle}
          </span>
        )}
      </span>

      {isPerson ? null : (
        <span className="rounded-full border border-[var(--edge)] px-2 py-0.5 text-xs text-[var(--muted)]">
          {labels.visibility[actor.visibility]}
        </span>
      )}

      {isPerson ? null : confirming ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDelete(actor.actorRef)}
            className="rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"
          >
            {labels.confirm}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg px-2.5 py-1 text-xs text-[var(--muted)]"
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
              featured ? "text-[var(--star)]" : "text-[var(--muted)]",
            )}
          >
            <Star className="size-4" />
          </button>
          <Link
            href={`/fursonas/${actor.handle}/edit`}
            aria-label={labels.edit}
            className="rounded-lg p-1.5 text-[var(--muted)]"
          >
            <Pencil className="size-4" />
          </Link>
          <button
            type="button"
            aria-label={labels.remove}
            onClick={() => setConfirming(true)}
            className="rounded-lg p-1.5 text-[var(--muted)]"
          >
            <Trash2 className="size-4" />
          </button>
        </span>
      )}
    </li>
  );
}
