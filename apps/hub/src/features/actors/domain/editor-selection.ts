import type { BlockPath } from "@/features/actors/domain/block-edits";

/**
 * What the canvas inspector is editing, or nothing when it is closed.
 *
 * `null` is deselected: empty canvas click and Escape both land here, and
 * the inspector must not render. `{ kind: "page" }` is the toolbar Page
 * control — not an empty click, because that click is how someone hides the
 * inspector. `{ kind: "block", path }` is a click on the live page.
 */
export type EditorSelection =
  | null
  | { readonly kind: "page" }
  | { readonly kind: "block"; readonly path: BlockPath };

/**
 * Positions from a `data-block-path` value, or undefined when it is not one.
 *
 * Only non-negative integers joined by hyphens are paths, matching the
 * public renderer's own `path` prop (`0-1-2`). An empty string is not the
 * page — the page is not a block and has no attribute.
 *
 * @param value - the attribute.
 * @returns the path, or undefined.
 */
export function parseBlockPath(value: string): BlockPath | undefined {
  if (value === "") return undefined;
  const parts = value.split("-");
  const path: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return undefined;
    path.push(Number(part));
  }
  return path;
}

/**
 * The dotted form a `data-block-path` attribute stores.
 *
 * @param path - positions, outermost first. Must name a block, not the page.
 * @returns the attribute value.
 */
export function formatBlockPath(path: BlockPath): string {
  return path.join("-");
}

/**
 * Whether two selections name the same target.
 *
 * Used to skip a re-render when a click lands on what is already selected.
 *
 * @param left - one selection.
 * @param right - the other.
 * @returns true when both are null, both are the page, or both name one path.
 */
export function sameSelection(
  left: EditorSelection,
  right: EditorSelection,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind === "page" || right.kind === "page") {
    return left.kind === "page" && right.kind === "page";
  }
  if (left.path.length !== right.path.length) return false;
  return left.path.every((index, at) => index === right.path[at]);
}
