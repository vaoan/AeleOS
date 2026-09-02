import type { BlockPath } from "@/features/actors/domain/block-edits";
import { blockAt } from "@/features/actors/domain/block-edits";
import type { Block } from "@/features/actors/domain/block-schema";

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

/**
 * The target above a selection, derived entirely from its path.
 *
 * Page has no parent, a top-level block's parent is Page, and a nested
 * block's parent is the path with its final position removed.
 *
 * @param selection - the target whose parent is wanted.
 * @returns its parent, or deselection above Page.
 */
export function parentSelection(
  selection: Exclude<EditorSelection, null>,
): EditorSelection {
  if (selection.kind === "page") return null;
  if (selection.path.length === 1) return { kind: "page" };
  return { kind: "block", path: selection.path.slice(0, -1) };
}

/**
 * Keeps a selection resolvable after a tree edit.
 *
 * A stale block path walks upward until a surviving block resolves. When no
 * block in the path survives, Page is the stable fallback. Page and explicit
 * deselection need no repair.
 *
 * @param blocks - the edited page.
 * @param selection - the selection made against its prior shape.
 * @returns the same target, its closest surviving ancestor, or Page.
 */
export function repairSelection(
  blocks: readonly Block[],
  selection: EditorSelection,
): EditorSelection {
  if (selection === null || selection.kind === "page") return selection;
  let path = [...selection.path];
  while (path.length > 0) {
    if (blockAt(blocks, path)) return { kind: "block", path };
    path = path.slice(0, -1);
  }
  return { kind: "page" };
}

/**
 * Whether two block paths name positions in one immediate scope.
 *
 * The inspector offers only visible siblings to dnd-kit. This predicate is
 * still enforced at collision time so a stale or synthetic target from
 * another level cannot turn that UI rule into a cross-level move.
 *
 * @param from - the lifted position.
 * @param to - the candidate drop position.
 * @returns true only when both non-empty paths share the same parent.
 */
export function areSiblingPaths(from: BlockPath, to: BlockPath): boolean {
  if (from.length === 0 || from.length !== to.length) return false;
  return from.slice(0, -1).every((position, index) => position === to[index]);
}

/**
 * Accepts a drag candidate only inside the lifted row's Items scope.
 *
 * Pointer collision, keyboard collision and final drop handling all use this
 * value boundary, so a missing, stale or synthetic cross-level id is discarded
 * consistently before it can name a move.
 *
 * @param from - the lifted position.
 * @param candidate - the candidate decoded from dnd-kit.
 * @returns the candidate when it is a sibling, otherwise undefined.
 */
export function siblingTarget(
  from: BlockPath,
  candidate: BlockPath | undefined,
): BlockPath | undefined {
  return candidate && areSiblingPaths(from, candidate) ? candidate : undefined;
}
