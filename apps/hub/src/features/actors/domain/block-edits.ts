import {
  BLOCK_LIMITS,
  CONTAINER_KIND,
  MAX_DEPTH,
  countBlocks,
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
 * the empty path: {@link addContentAt} and {@link wrapLeafOnPage} use it to
 * mean "onto the page", and every other operation here still refuses it —
 * there is no block at the root, only the array.
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
 * The block sitting at a path, or null when that place is empty or missing.
 *
 * The empty path is the page, which is an array rather than a block, so this
 * answers null there rather than inventing a root container.
 *
 * @param blocks - the whole page.
 * @param path - where to look.
 * @returns the block, or null.
 */
export function blockAt(
  blocks: readonly Block[],
  path: BlockPath,
): Block | null {
  if (path.length === 0) return null;
  let here: Block | null | undefined = blocks[path[0]!];
  for (let index = 1; index < path.length; index += 1) {
    if (!here || !isContainer(here)) return null;
    here = here.children[path[index]!] ?? null;
  }
  return here ?? null;
}

/**
 * A leaf dropped on the page, stored as an unnamed stack section.
 *
 * Depth 0 is still a container — the schema never grew top-level leaves as
 * the authoring front door. Empty `name_en` is unnamed: the public renderer
 * draws no heading. Two blocks are added (the wrapper and the leaf), so a
 * page already at the cap comes back unchanged by identity.
 *
 * @param blocks - the whole page.
 * @param leaf - the content.
 * @returns the new page, or the one given when the cap would be crossed.
 */
export function wrapLeafOnPage(
  blocks: readonly Block[],
  leaf: LeafBlock,
): Block[] {
  if (countBlocks(blocks) + 2 > BLOCK_LIMITS.blocks) {
    return blocks as Block[];
  }
  return [
    ...blocks,
    {
      ...newContainer("stack", 1),
      name_en: "",
      children: [leaf],
    },
  ];
}

/**
 * Puts content into a target: the page (empty path) or a block.
 *
 * A leaf on the page is {@link wrapLeafOnPage}. A container on the page is
 * appended as a section. A container target fills its first empty place, or
 * grows by one place when every place is filled. A leaf target is wrapped
 * in a stack with the new block beside it, refused at the depth cap — same
 * array identity, so a caller comparing by identity sees a no-op.
 *
 * @param blocks - the whole page.
 * @param path - empty for the page, otherwise the target.
 * @param block - what to put there.
 * @returns the new page, or the one given where the write is refused.
 */
export function addContentAt(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): Block[] {
  if (path.length === 0) {
    if (!isContainer(block)) return wrapLeafOnPage(blocks, block);
    if (countBlocks(blocks) >= BLOCK_LIMITS.blocks) return blocks as Block[];
    return setAt(blocks, [blocks.length], block);
  }
  const target = blockAt(blocks, path);
  if (!target) return blocks as Block[];
  if (isContainer(target)) {
    const empty = target.children.indexOf(null);
    if (empty !== -1) return setAt(blocks, [...path, empty], block);
    const grown = appendPlace(blocks, path);
    const next = blockAt(grown, path);
    if (
      !next ||
      !isContainer(next) ||
      next.children.length === target.children.length
    ) {
      return blocks as Block[];
    }
    return setAt(grown, [...path, next.children.length - 1], block);
  }
  if (!mayNest(path)) return blocks as Block[];
  return setAt(blocks, path, {
    ...newContainer("stack", 1),
    name_en: "",
    children: [target, block],
  });
}

/**
 * The page with a block put in a place, making that place a column if it has
 * to.
 *
 * **A place holds one child, so a column is a `stack` and there is no second
 * mechanism.** An empty place takes the block directly; a place already
 * holding one gets a `stack` wrapping both; a place already holding a `stack`
 * gets an append. That is what makes "sides and a middle" a shape somebody
 * chooses rather than a tree they assemble.
 *
 * **The wrap is refused where a container may not sit**, and the page comes
 * back unchanged — the same array, so a caller comparing by identity sees a
 * no-op. A place at the depth cap may hold content and nothing else, and
 * wrapping there would build a tree the database refuses on save; refusing now
 * is the difference between a control that does nothing visible and a page
 * that cannot be stored.
 *
 * **The editor never removes a stack it made.** An emptied column renders as
 * an empty place, which is what an empty place already does, and it is deleted
 * the way any block is.
 *
 * @param blocks - the whole page.
 * @param path - the place.
 * @param block - what to put there.
 * @returns the new page, or the one given where the wrap is refused.
 */
export function addToPlace(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): Block[] {
  // **The flag exists because the refusal needs both halves of one look.**
  // Whether to wrap depends on what is AT the path, and `updateAt` is the
  // module's only traversal — adding a reader beside it would be a second
  // place to get the walk right. So the updater records the refusal and the
  // caller returns the array it was given, unchanged by identity.
  let refused = false;
  const next = updateAt(blocks, path, (here) => {
    if (!here) return block;
    if (isContainer(here) && here.mode === "stack") {
      return { ...here, children: [...here.children, block] };
    }
    if (!mayNest(path)) {
      refused = true;
      return here;
    }
    return {
      ...newContainer("stack", 1),
      name_en: undefined,
      children: [here, block],
    };
  });
  return refused ? (blocks as Block[]) : next;
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
 * The same list with a block spliced in at the named index, shifting later
 * entries up.
 *
 * **The path is the destination index, which may be one past the last entry**
 * — that is an append, the same write {@link setAt} already does at the page
 * root. A path that runs through a leaf or an empty place leaves the page
 * unchanged, matching {@link updateAt}.
 *
 * Linear Carrd-style drops use this rather than {@link setAt}: writing over an
 * occupied index would swap, and swapping is the positional rule, not the
 * stack/list rule. See `domain/block-drops.ts`.
 *
 * **A negative top-level index is not defended against**, because every
 * current caller (`domain/block-drops.ts`'s `applyLinearDrop`) derives its
 * path from a validated place, never a raw literal — so a negative index
 * reaches `Array.prototype.splice` unchanged, which inserts before the LAST
 * entry rather than refusing or prepending. Do not pass a raw index here
 * without re-checking this note; `block-edits.test.ts`'s "insertAt edge
 * contracts" pins the behaviour as-is rather than a rule this domain chose.
 *
 * @param blocks - the whole page.
 * @param path - where the block should sit afterwards.
 * @param block - what to put there.
 * @returns the new page.
 */
export function insertAt(
  blocks: readonly Block[],
  path: BlockPath,
  block: Block,
): Block[] {
  return insertEntry(blocks, path, block) as Block[];
}

/**
 * The same list with one entry spliced in.
 *
 * @param entries - the places to edit.
 * @param path - where to insert, relative to these entries.
 * @param block - what to insert.
 * @returns the list with that entry added.
 */
function insertEntry(
  entries: readonly (Block | null)[],
  path: BlockPath,
  block: Block,
): (Block | null)[] {
  const [head, ...rest] = path;
  if (path.length === 0) return [...entries];
  if (rest.length === 0) {
    const next = [...entries];
    next.splice(head!, 0, block);
    return next;
  }
  const next = [...entries];
  const here = next[head!] ?? null;
  if (here && isContainer(here)) {
    next[head!] = {
      ...here,
      children: insertEntry(here.children, rest, block),
    };
  }
  return next;
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
 * The page with a container's width written, and its weights trimmed or padded to
 * match.
 *
 * **This exists because the two are one fact.** A weight list whose length is
 * not the container's `spaces` is ignored by every reader and refused by the
 * write, so changing the count and leaving the list stale would silently drop
 * an author's proportions at the moment they touched the control — and it
 * would do it without an error, because ignoring is not failing.
 *
 * **It cannot lose content, and that is `patchContainer` doing the work rather
 * than a rescue here.** `children` is not among the fields either function
 * writes, so narrowing re-wraps the same children into more rows.
 *
 * A container with no weights stays without any: uniform is a real answer and
 * not a gap to fill in.
 *
 * @param blocks - the whole page.
 * @param path - the container.
 * @param spaces - how many places across it should now lay.
 * @returns the new page.
 */
export function setSpaces(
  blocks: readonly Block[],
  path: BlockPath,
  spaces: number,
): Block[] {
  return updateAt(blocks, path, (block) => {
    if (!block || !isContainer(block)) return block;
    const weights = block.weights
      ? Array.from({ length: spaces }, (_, at) => block.weights?.[at] ?? 1)
      : undefined;
    return { ...block, spaces, weights };
  });
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
 * The page with one table row's icon set or cleared.
 *
 * **The icon lives on the row's FIRST cell**, which is the cell the renderer
 * reads it from — one mark per row rather than one per cell. A row with no
 * cells at all is left exactly as it was: there is nowhere to put the icon,
 * and creating a cell to hold one would add a column to the table as a side
 * effect of choosing a decoration.
 *
 * @param blocks - the whole page.
 * @param path - which leaf.
 * @param row - which row.
 * @param icon - the lucide name, or `""` to clear it.
 * @returns the new page. Clearing REMOVES the key rather than storing an empty
 *   string, so a cleared icon leaves the cell byte-identical to one that never
 *   had it.
 */
export function setTableRowIcon(
  blocks: readonly Block[],
  path: BlockPath,
  row: number,
  icon: string,
): Block[] {
  return editRows(blocks, path, (rows) =>
    rows.map((cells, index) =>
      index === row
        ? cells.map((held, at) =>
            at === 0 ? { ...held, icon: icon || undefined } : held,
          )
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
