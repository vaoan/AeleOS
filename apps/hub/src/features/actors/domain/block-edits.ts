import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  MAX_DEPTH,
  isContainer,
  type Block,
  type ContainerBlock,
  type ContainerMode,
  type LeafBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";

/**
 * Where one block sits in a page: its index at each level, outermost first.
 *
 * `[2]` is the third section; `[2, 0]` is the first place of that section;
 * `[2, 0, 1]` is the second place of whatever sits there. The page itself is
 * the empty path, which no operation here accepts — there is no block at the
 * root, only the array.
 *
 * **A path is positions and nothing else**, which is what makes it usable as
 * an identifier as well as an address: nothing an author typed is in it, so it
 * is safe as a React key and as a DOM `id`, exactly as `BlockProps.path` is on
 * the public page. The two are the same idea spelled for two audiences — that
 * one is a string because it becomes an HTML attribute, this one an array
 * because it is walked.
 */
export type BlockPath = readonly number[];

/**
 * The shapes an author may pick from, widest last.
 *
 * Derived from {@link BLOCK_LIMITS.spaces} rather than listed, so the
 * vocabulary the schema accepts and the vocabulary the editor offers cannot
 * drift — a number offered here and refused by `validate_block` would be a
 * save the person cannot explain.
 */
export const SPACE_CHOICES: readonly number[] = Array.from(
  { length: BLOCK_LIMITS.spaces },
  (_, index) => index + 1,
);

/**
 * A new piece of content of the chosen kind, carrying only what it must.
 *
 * `title_en` is empty, which the strict save schema refuses — deliberately.
 * A block is a heading with something under it, and an untitled one is a blank
 * box; the person is told at the save rather than prevented from placing it,
 * because placing and writing are separate acts and half a page is an ordinary
 * state to leave the editor in.
 *
 * @param kind - what the content is.
 * @returns the leaf.
 */
export function newLeaf(kind: LeafKind): LeafBlock {
  return { kind, title_en: "", description_en: "" };
}

/**
 * A new section, or a section inside one, with its places already laid.
 *
 * **It starts with exactly as many empty places as it is wide**, which is the
 * shape somebody just chose made visible: a six-space section holding nothing
 * shows six places to put something in, and a section is not a fault for being
 * empty. Nothing enforces a sensible number of children for a width and
 * nothing should — see `ContainerBlock.children`.
 *
 * @param mode - how it arranges what is in it.
 * @param spaces - how many places across.
 * @returns the container.
 */
export function newContainer(
  mode: ContainerMode,
  spaces: number,
): ContainerBlock {
  return {
    kind: CONTAINER_KIND,
    mode,
    spaces,
    name_en: "",
    children: Array.from({ length: spaces }, () => null),
  };
}

/**
 * Whether a container may sit at this path.
 *
 * The depth cap is three — a section, a container inside it, a container
 * inside that, then leaves — so a place at depth {@link MAX_DEPTH} may hold
 * content and nothing else. Depth is the path's length less one, because the
 * outermost index names a section at depth 0.
 *
 * **The editor asks this to decide whether to OFFER the control**, never to
 * decide what to store: a place too deep for a section simply does not offer
 * one, so nobody meets `TOO_DEEP_MESSAGE` for something they were invited to
 * do. `validate_block` in `0009` is still the authority, and this is a
 * courtesy in front of it.
 *
 * @param path - where the block would sit.
 * @returns true when a container is allowed there.
 */
export function mayNest(path: BlockPath): boolean {
  return path.length <= MAX_DEPTH;
}

/**
 * The same list with one entry replaced by what an editor made of it.
 *
 * Recursive over `children`, and **it copies rather than mutates at every
 * level**: the tree is held in one form field, so an in-place write would
 * change an object react-hook-form is still holding as the previous value and
 * nothing would re-render.
 *
 * A path that runs through a leaf, or through a place holding nothing, changes
 * nothing at all. That is not a defence against a caller — the editor only
 * ever builds a path from where it is rendering — but against a path held
 * across a removal, which is the fault a captured index produces and which
 * this project has already paid for once in the flat editor.
 *
 * @param entries - the places to edit, which may hold nothing.
 * @param path - where the block sits, relative to these entries.
 * @param edit - what to put there, given what is there.
 * @returns the same list with that one entry replaced.
 */
function updateEntries(
  entries: readonly (Block | null)[],
  path: BlockPath,
  edit: (block: Block | null) => Block | null,
): (Block | null)[] {
  const [head, ...rest] = path;
  const next = [...entries];
  const here = next[head!] ?? null;
  if (rest.length === 0) {
    next[head!] = edit(here);
    return next;
  }
  if (here && isContainer(here)) {
    next[head!] = {
      ...here,
      children: updateEntries(here.children, rest, edit),
    };
  }
  return next;
}

/**
 * The page with one block replaced by what an editor made of it.
 *
 * @param blocks - the whole page.
 * @param path - where the block sits.
 * @param edit - what to put there, given what is there.
 * @returns the new page.
 */
function updateAt(
  blocks: readonly Block[],
  path: BlockPath,
  edit: (block: Block | null) => Block | null,
): Block[] {
  return updateEntries(blocks, path, edit) as Block[];
}

/**
 * The page with a block put in a place.
 *
 * Also how a section is APPENDED: a path naming one past the last section
 * writes there, because a page array has no empty entries to keep and an
 * append is a write to the next index.
 *
 * @param blocks - the whole page.
 * @param path - where to put it.
 * @param next - the block.
 * @returns the new page.
 */
export function setAt(
  blocks: readonly Block[],
  path: BlockPath,
  next: Block,
): Block[] {
  return updateAt(blocks, path, () => next);
}

/**
 * The page with a place emptied — what was in it gone, the place still there.
 *
 * **This is the one operation the whole model turns on.** Removing what is in
 * a place must not remove the place: the shape an author chose is theirs, and
 * a section that closed up round a deletion would change under them as they
 * worked. So a nested place becomes `null` and keeps its position, and
 * `[a, null, b]` still means `b` is third.
 *
 * **A SECTION has no place to leave behind**, because the page array holds no
 * empty entries — there is nothing above a section to keep room in. So a path
 * naming a section removes it outright, which is {@link removeAt}.
 *
 * @param blocks - the whole page.
 * @param path - the place to empty.
 * @returns the new page.
 */
export function clearAt(blocks: readonly Block[], path: BlockPath): Block[] {
  if (path.length === 1) return removeAt(blocks, path);
  return updateAt(blocks, path, () => null);
}

/**
 * The same list with one entry gone and everything after it moved up.
 *
 * @param entries - the places to edit.
 * @param path - which one to drop, relative to these entries.
 * @returns the same list without it.
 */
function dropEntry(
  entries: readonly (Block | null)[],
  path: BlockPath,
): (Block | null)[] {
  const [head, ...rest] = path;
  if (rest.length === 0) return entries.filter((_, index) => index !== head);
  const next = [...entries];
  const here = next[head!] ?? null;
  if (here && isContainer(here)) {
    next[head!] = { ...here, children: dropEntry(here.children, rest) };
  }
  return next;
}

/**
 * The page with a place gone entirely, not merely emptied.
 *
 * The other half of {@link clearAt}, and the two are genuinely different acts:
 * emptying leaves room for the next thing, removing takes the room away and
 * moves everything after it up a place. An editor that offered only one of
 * them would make the shape either impossible to shrink or impossible to keep.
 *
 * @param blocks - the whole page.
 * @param path - the place to remove.
 * @returns the new page.
 */
export function removeAt(blocks: readonly Block[], path: BlockPath): Block[] {
  return dropEntry(blocks, path) as Block[];
}

/**
 * The page with one more empty place at the end of a container.
 *
 * `path` names the CONTAINER, not a place inside it. A place beyond the
 * container's width starts a new row, which is what makes a section grow
 * downward as things are added.
 *
 * Refuses to go past {@link BLOCK_LIMITS.children}, which the database also
 * refuses — a control that quietly did nothing at the cap is the fault this
 * project keeps catching, so the editor withdraws the control instead and this
 * is the backstop behind it.
 *
 * @param blocks - the whole page.
 * @param path - the container to widen.
 * @returns the new page.
 */
export function appendPlace(
  blocks: readonly Block[],
  path: BlockPath,
): Block[] {
  return updateAt(blocks, path, (block) =>
    block && isContainer(block) && block.children.length < BLOCK_LIMITS.children
      ? { ...block, children: [...block.children, null] }
      : block,
  );
}

/**
 * The page with a leaf's kind changed and everything it holds kept.
 *
 * **Nothing else on the block is touched, and that is a contract rather than
 * an implementation detail.** Every field is accepted whatever the kind is —
 * see `LeafBlock` — so switching a kind to see what it looks like and
 * switching back finds what was typed still there. The editor hides the
 * fields a kind does not render; it never clears them.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param kind - what it becomes.
 * @returns the new page.
 */
export function setLeafKind(
  blocks: readonly Block[],
  path: BlockPath,
  kind: LeafKind,
): Block[] {
  return updateAt(blocks, path, (block) =>
    block && !isContainer(block) ? { ...block, kind } : block,
  );
}

/**
 * The page with some of a leaf's fields written.
 *
 * `kind` is not among them — see {@link setLeafKind}, which is a separate act
 * precisely because it must not disturb anything else.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param patch - the fields to write.
 * @returns the new page.
 */
export function patchLeaf(
  blocks: readonly Block[],
  path: BlockPath,
  patch: Partial<Omit<LeafBlock, "kind">>,
): Block[] {
  return updateAt(blocks, path, (block) =>
    block && !isContainer(block) ? { ...block, ...patch } : block,
  );
}

/**
 * The page with some of a container's own fields written — its name, its
 * arrangement, its width, its style.
 *
 * **`children` is not among them, and narrowing `spaces` therefore cannot
 * lose anything.** `spaces` is how many places a container lays ACROSS;
 * children fill them row by row and the section grows downward. So narrowing
 * a six-space section to two re-wraps its six children into three rows rather
 * than displacing four of them — there is no occupant to strand, because the
 * width was never a capacity. That is the model doing the work, not a rescue
 * bolted on top of it, and `block-edits.test.ts` states it as the case it
 * would be easiest to break: rewriting `children` to the new width here would
 * destroy everything past it and could not be undone by widening again.
 *
 * @param blocks - the whole page.
 * @param path - the container.
 * @param patch - the fields to write.
 * @returns the new page.
 */
export function patchContainer(
  blocks: readonly Block[],
  path: BlockPath,
  patch: Partial<Omit<ContainerBlock, "kind" | "children">>,
): Block[] {
  return updateAt(blocks, path, (block) =>
    block && isContainer(block) ? { ...block, ...patch } : block,
  );
}

/**
 * A `table` leaf's rows as they are stored, defaulting an absent list to none.
 *
 * @param leaf - the leaf.
 * @returns its rows, never absent.
 */
function rowsOf(leaf: LeafBlock): TableRows {
  return leaf.rows ?? [];
}

/** The rows a `table` leaf holds, as {@link LeafBlock.rows} spells them. */
type TableRows = NonNullable<LeafBlock["rows"]>;

/**
 * The page with a `table` leaf's rows replaced.
 *
 * The one place the five row operations below write through, so each of them
 * is the array change it is named for and nothing else.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param edit - the rows, given what is there.
 * @returns the new page.
 */
function editRows(
  blocks: readonly Block[],
  path: BlockPath,
  edit: (rows: TableRows) => TableRows,
): Block[] {
  return updateAt(blocks, path, (block) =>
    block && !isContainer(block)
      ? { ...block, rows: edit(rowsOf(block)) }
      : block,
  );
}

/**
 * A blank cell, which is a real cell.
 *
 * A table with a gap in it is an ordinary table, so a cell starts empty rather
 * than being refused for it — the same rule `tableCellShape` states with its
 * own `.default("")`.
 *
 * @returns the cell.
 */
const blankCell = () => ({ text_en: "" });

/**
 * The page with one more row on a `table` leaf.
 *
 * The row starts as a pair, because `TableLeaf` announces the first cell of
 * each row as that row's header and the rest as its values — a row of one is a
 * header with nothing under it. Refuses to go past
 * {@link BLOCK_LIMITS.rows}, which the database also refuses.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @returns the new page.
 */
export function addTableRow(
  blocks: readonly Block[],
  path: BlockPath,
): Block[] {
  return editRows(blocks, path, (rows) =>
    rows.length < BLOCK_LIMITS.rows
      ? [...rows, [blankCell(), blankCell()]]
      : rows,
  );
}

/**
 * The page with one row of a `table` leaf gone.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param row - which row.
 * @returns the new page.
 */
export function removeTableRow(
  blocks: readonly Block[],
  path: BlockPath,
  row: number,
): Block[] {
  return editRows(blocks, path, (rows) =>
    rows.filter((_, index) => index !== row),
  );
}

/**
 * The page with one more cell on a row of a `table` leaf.
 *
 * Refuses to go past {@link BLOCK_LIMITS.cells}, which the database also
 * refuses and which exists because a table wider than that cannot be read on a
 * phone — where most of these pages are read.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param row - which row.
 * @returns the new page.
 */
export function addTableCell(
  blocks: readonly Block[],
  path: BlockPath,
  row: number,
): Block[] {
  return editRows(blocks, path, (rows) =>
    rows.map((cells, index) =>
      index === row && cells.length < BLOCK_LIMITS.cells
        ? [...cells, blankCell()]
        : cells,
    ),
  );
}

/**
 * The page with one cell of a `table` leaf gone.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param row - which row.
 * @param cell - which cell of it.
 * @returns the new page.
 */
export function removeTableCell(
  blocks: readonly Block[],
  path: BlockPath,
  row: number,
  cell: number,
): Block[] {
  return editRows(blocks, path, (rows) =>
    rows.map((cells, index) =>
      index === row ? cells.filter((_, at) => at !== cell) : cells,
    ),
  );
}

/**
 * The page with one cell of a `table` leaf written, in one language.
 *
 * **An empty Spanish cell is REMOVED rather than stored as `""`**, and an
 * empty English one is kept, which is the two fields' own asymmetry rather
 * than an inconsistency: `text_en` carries a default and `text_es` is
 * optional, so a page whose author has not written the Spanish reads back
 * exactly as it was written rather than carrying a key holding nothing.
 * Nothing anywhere reports the absence as a fault — a missing Spanish cell is
 * somebody who has not written it yet.
 *
 * @param blocks - the whole page.
 * @param path - the leaf.
 * @param row - which row.
 * @param cell - which cell of it.
 * @param lang - which language is being written.
 * @param text - what they typed.
 * @returns the new page.
 */
export function setTableCell(
  blocks: readonly Block[],
  path: BlockPath,
  row: number,
  cell: number,
  lang: "en" | "es",
  text: string,
): Block[] {
  // Named rather than written inline: an unwritten Spanish cell is REMOVED
  // where an empty English one is kept, and folding that into the row-and-cell
  // walk would be a third level of conditional in one expression.
  const written = (held: TableRows[number][number]) =>
    lang === "en"
      ? { ...held, text_en: text }
      : { ...held, text_es: text || undefined };

  return editRows(blocks, path, (rows) =>
    rows.map((cells, index) =>
      index === row
        ? cells.map((held, at) => (at === cell ? written(held) : held))
        : cells,
    ),
  );
}

/**
 * The page with a section moved to another position among the sections.
 *
 * Sections only — the outermost level. Moving a block between places is
 * phase 4's, on `@dnd-kit`, which is the only library of the two that can
 * express a nested drag at all; until then a place is filled and emptied
 * explicitly.
 *
 * @param blocks - the whole page.
 * @param from - where the section is.
 * @param to - where it goes.
 * @returns the new page.
 */
export function moveSection(
  blocks: readonly Block[],
  from: number,
  to: number,
): Block[] {
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  if (moved) next.splice(to, 0, moved);
  return next;
}
