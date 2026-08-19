import type { BlockPath } from "@/features/actors/domain/block-edits";

/**
 * One thing the save schema refused, and where it sits.
 *
 * **The path is a {@link BlockPath}, so the editor can mark the block that is
 * actually wrong** rather than showing one sentence about a page with fifty
 * blocks on it. `field` is the property the refusal landed on — `title_en` for
 * the overwhelmingly common case, since a new leaf starts untitled and the
 * write schema requires a heading.
 */
export interface BlockProblem {
  /** Where the block sits, outermost index first. */
  path: BlockPath;
  /** Which of its fields was refused. */
  field: string;
}

/**
 * Whether this looks like one of react-hook-form's own error leaves.
 *
 * An error leaf is `{ type, message }`; every node above it is an array or an
 * object mirroring the value's own shape. Both keys are checked rather than
 * one, because a block's own `type` would otherwise look like an error node —
 * no block has one today, and the whole point of walking an `unknown` tree is
 * not to depend on that staying true.
 *
 * @param node - the node to test.
 * @returns true when it is an error rather than a level of the tree.
 */
function isErrorLeaf(node: unknown): node is { message?: unknown } {
  if (typeof node !== "object" || node === null) return false;
  return "type" in node && "message" in node;
}

/**
 * Every refusal in one react-hook-form error subtree, as block paths.
 *
 * **This is what turns "your page was refused" into something somebody can
 * act on.** `zodResolver` maps each zod issue onto the value's own shape, so a
 * leaf with no title produces an error at `sections[0].children[1].title_en`
 * — which is a `BlockPath` of `[0, 1]` with `children` spelled out between the
 * indices. Reading it back is what lets the editor put `aria-invalid` on the
 * one input that is wrong and expand whatever is collapsed above it.
 *
 * **It is walked structurally rather than by naming `children`**, so the
 * numeric steps are the path and the final named step is the field. A shape
 * assumption stated in prose is the kind this project keeps paying for, so
 * `fursona-editor.test.tsx` drives a real refused save through the real
 * resolver and asserts the mark appears — the assumption is measured rather
 * than described.
 *
 * **A page-level refusal produces nothing, deliberately.** "Too many blocks"
 * and "blocks are too large" are `refine`s on the whole array, so they carry no
 * index and there is no block to mark; the editor tells those apart by this
 * list being empty and says something different. A banner promising a marking
 * nothing made is the fault this function exists to end, and it must not be
 * reintroduced one refusal at a time.
 *
 * @param errors - the `errors.sections` subtree, or anything at all.
 * @returns one entry per refused field, outermost first.
 */
export function blockProblems(errors: unknown): BlockProblem[] {
  const found: BlockProblem[] = [];

  /**
   * Walks one level, remembering the indices seen on the way down.
   *
   * @param node - the level to walk.
   * @param path - the indices above it.
   */
  const walk = (node: unknown, path: number[]): void => {
    if (typeof node !== "object" || node === null) return;
    for (const [key, child] of Object.entries(node)) {
      const index = Number(key);
      if (Number.isInteger(index) && String(index) === key) {
        walk(child, [...path, index]);
      } else if (isErrorLeaf(child)) {
        // A named step holding an error IS the field, and the indices above it
        // are the block. Nothing deeper is walked: zod reports the innermost
        // issue, so a message on `title_en` has nothing under it.
        found.push({ path, field: key });
      } else {
        // A named step that is not an error is a level of the value's own
        // shape — `children`, or `rows` on a table leaf — so it is walked
        // WITHOUT lengthening the path, which is what makes the numeric steps
        // alone the block's address.
        walk(child, path);
      }
    }
  };

  walk(errors, []);
  return found;
}

/**
 * Which of one block's own fields were refused.
 *
 * **Every field rather than a yes/no per field**, so a component can mark the
 * controls it draws AND notice that something it does not draw was refused —
 * which is the difference between "the title is marked" and "nothing on this
 * block is marked and the banner says otherwise".
 *
 * The names are zod's own, so they are field names rather than anything an
 * author typed; a `Set` built from them is safe to test membership on.
 *
 * @param problems - what the save refused.
 * @param path - the block.
 * @returns the field names refused at exactly that path.
 */
export function problemFields(
  problems: readonly BlockProblem[],
  path: BlockPath,
): string[] {
  return problems
    .filter(
      (problem) =>
        problem.path.length === path.length &&
        problem.path.every((step, index) => step === path[index]),
    )
    .map((problem) => problem.field);
}

/**
 * Whether anything at or below this path was refused.
 *
 * **What makes a collapsed card open itself.** A block three levels down
 * inside a collapsed section is a refusal somebody cannot see, let alone act
 * on, so a card holding one shows its places whatever its collapse control
 * says — the control is about looking, and this is about being able to look.
 *
 * @param problems - what the save refused.
 * @param path - the block, or the container above it.
 * @returns true when a refusal sits at or beneath it.
 */
export function problemUnder(
  problems: readonly BlockProblem[],
  path: BlockPath,
): boolean {
  return problems.some(
    (problem) =>
      problem.path.length >= path.length &&
      path.every((step, index) => step === problem.path[index]),
  );
}
