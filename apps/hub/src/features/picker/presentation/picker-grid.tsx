import type { ReactNode } from "react";

/** What {@link PickerGrid} needs to turn a list of tiles into a choice. */
export interface PickerGridProps {
  /**
   * The server action a chosen tile submits to. Passed in rather than imported,
   * because the action lives under `app/` and a feature must not reach into a
   * route.
   */
  action: (formData: FormData) => void | Promise<void>;

  /**
   * The already-validated destination, carried back to the action in a hidden
   * field. The action re-validates it — see the note below on why that is not
   * belt-and-braces.
   */
  returnTo: string;

  /** One tile per actor the caller may pick, each an `li` with a submit button. */
  children: ReactNode;
}

/**
 * The list of actors a person can hand back to the app that sent them here.
 *
 * **One form around the whole list, not one per tile.** A `ul` may contain
 * nothing but `li`, so a form cannot wrap a single tile without inventing
 * one-item lists. HTML already answers "which of these did you click": several
 * submit buttons in one form, each naming the same field with its own value.
 * The tiles carry those buttons (`ActorTile`'s `choose` prop); this supplies
 * the form they submit to and the destination they submit with.
 *
 * **The hidden `return_to` is not a trusted channel.** Anything in the page can
 * be edited before it is submitted, so the value here is a convenience for the
 * happy path and nothing more — the action checks it against the origin
 * allowlist again on arrival, exactly as if it had never been checked.
 *
 * Takes the action as a prop for the same reason the forms in `features/actors`
 * do: presentation renders, it does not decide what submitting means.
 *
 * @returns the form wrapping the tiles.
 */
export function PickerGrid({ action, returnTo, children }: PickerGridProps) {
  return (
    <form action={action}>
      <input type="hidden" name="return_to" value={returnTo} />
      <ul className="mt-8 grid gap-3">{children}</ul>
    </form>
  );
}
