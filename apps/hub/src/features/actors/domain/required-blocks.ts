import {
  CONTAINER_KIND,
  isContainer,
  LEAF_KINDS,
  type Block,
  type ContainerBlock,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  isCustomised,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";

/**
 * Which kind of page is being validated.
 *
 * The same two values `actors.kind` holds, where the column is immutable — so
 * this is a stable fact about a row rather than something a caller chooses.
 */
export type ActorKind = "person" | "fursona";

/**
 * The leaf kinds a page of each actor kind must carry at least one of.
 *
 * **At least one, never exactly one.** Any number of copies, at any depth, in
 * any container — a portrait at the top of a page and again beside a signature
 * is two `avatar` blocks and both are wanted.
 *
 * **The guarantee is that the block EXISTS IN THE TREE, not that a visitor
 * sees it**, and the difference is a known, accepted hole rather than an
 * oversight. `accordion` renders each child as a `<details>` with no `open`
 * attribute and `tabs` shows one child at a time, so a required block placed
 * inside either satisfies every check here, at the save boundary, and in
 * `set_actor_sections`, while showing a stranger nothing. Colour can hide one
 * just as completely, and deliberately: an author's own colours are rendered
 * exactly as picked and nothing corrects them.
 *
 * That was weighed against putting the ownership FACT in the page chrome —
 * outside `SKIN_SCOPE`, derived from the row, un-styleable — and declined: the
 * ruling is that every part of the page belongs to its owner. Read the spec
 * before concluding this rule is stronger than it is. If accountability ever
 * has to be genuinely enforced, the chrome route is the design to revive and
 * it composes with this rather than replacing it.
 *
 * `owner` is required on a fursona's page and `fursonas` on a person's,
 * because neither has anything to render on the other. `name` is on neither
 * list: `display_name` is nullable, so requiring it would make a page
 * impossible to save until somebody filled in a field the schema lets them
 * leave empty.
 */
export const REQUIRED_KINDS = {
  person: ["avatar", "handle", "fursonas"],
  fursona: ["avatar", "handle", "owner"],
} as const satisfies Record<ActorKind, readonly LeafKind[]>;

/**
 * The leaf kind a page of each actor kind may NOT carry.
 *
 * The mirror of {@link REQUIRED_KINDS}, and until this constant existed it was
 * enforced **only** in `set_actor_sections`: the client knew what a page must
 * have and nothing about what it may not. So `owner` could be chosen from the
 * leaf-kind select on a person's page, and the save came back as a database
 * exception with no block marked and no reason named.
 *
 * `owner` and `fursonas` refuse each other's pages because neither has
 * anything to render on the other — a person has no owner and a fursona has no
 * characters of its own.
 *
 * `block-limits-match-migration.test.ts` pins this to `0009`, because a
 * vocabulary written down in two languages needs the test that says so in the
 * same change.
 */
export const REFUSED_KIND = {
  person: "owner",
  fursona: "fursonas",
} as const satisfies Record<ActorKind, LeafKind>;

/**
 * The leaf kinds a page of this actor kind may hold.
 *
 * Every kind but the one its actor kind refuses. Exported so the editor's kind
 * select can withdraw the option rather than offering a choice the database
 * will reject, and so an import can name a block it must report.
 *
 * @param kind - which kind of actor's page it is.
 * @returns the offerable kinds, in {@link LEAF_KINDS} order.
 */
export function offerableLeafKinds(kind: ActorKind): readonly LeafKind[] {
  return LEAF_KINDS.filter((one) => one !== REFUSED_KIND[kind]);
}

/**
 * Every leaf kind present anywhere in a tree.
 *
 * Descends through `children` only, skipping the `null` entries that are empty
 * places. A container's own kind is not collected: `container` is not a leaf
 * kind and no rule can require one.
 *
 * @param blocks - the blocks to walk, empty places included.
 * @param into - the set to collect into.
 */
function collectKinds(
  blocks: readonly (Block | null)[],
  into: Set<string>,
): void {
  for (const block of blocks) {
    if (block === null) continue;
    if (isContainer(block)) {
      collectKinds(block.children, into);
      continue;
    }
    into.add(block.kind);
  }
}

/**
 * Which required kinds a page is missing.
 *
 * **Found at ANY depth**, which is what makes the rule match what somebody can
 * actually build: a portrait nested two levels inside a section is still a
 * portrait on the page.
 *
 * The result is in {@link REQUIRED_KINDS} order rather than traversal order,
 * so the sentence a person reads is stable — and it names every missing kind
 * rather than the first, because somebody who removed two blocks should be
 * told about two.
 *
 * @param blocks - the page, as parsed.
 * @param kind - which kind of actor's page it is.
 * @returns the missing kinds, empty when the page is complete.
 */
export function missingRequiredKinds(
  blocks: readonly (Block | null)[],
  kind: ActorKind,
): LeafKind[] {
  const present = new Set<string>();
  collectKinds(blocks, present);
  return REQUIRED_KINDS[kind].filter((required) => !present.has(required));
}

/**
 * The label each identity kind is seeded with.
 *
 * The app's suggestion, not the author's writing — the moment somebody edits
 * one it is theirs, and a missing translation stops being a fault.
 */
const TITLES: Record<string, string> = {
  avatar: "Portrait",
  handle: "Handle",
  name: "Name",
  owner: "Owner",
  fursonas: "Fursonas",
};

/**
 * A leaf of the given kind, carrying the title every leaf must have.
 *
 * @param kind - the leaf kind to mint.
 * @param title - its label, in both languages. Seeded identically because it
 *   is the app's suggestion rather than the author's writing; the moment they
 *   change one, it is theirs and a missing translation is not a fault.
 * @returns the leaf.
 */
function identityLeaf(kind: LeafKind, title: string): Block {
  return {
    kind,
    // **Not empty.** `title_en` is required and non-empty at the strict write
    // and again in `validate_block`, so a seeded block with a blank title is
    // one the first save would refuse — on a page nobody wrote.
    title_en: title,
    title_es: title,
    description_en: "",
  } as Block;
}

/**
 * The section a page gets when it names no identity blocks of its own.
 *
 * A two-place grid weighted narrow-then-wide: the portrait in the first place,
 * a stack of the name and the handle in the second. On a fursona's page the
 * owner joins that stack, because "belongs to #42" reads next to the name
 * rather than at the foot of the page.
 *
 * **It approximates the welded header rather than reproducing it.** That one
 * was a wrapping flex row; this is a grid, so the portrait sits in a place
 * about a fifth of the page wide and a narrow screen stacks where the old row
 * wrapped. The difference is the feature: this one can be taken apart.
 *
 * Depth is section → stack → leaf, which is three levels and inside the cap.
 * `[1, 3]` is inside the one-to-six range a share may take.
 *
 * @param kind - which kind of actor's page it is.
 * @returns the section.
 */
export function defaultIdentitySection(kind: ActorKind): ContainerBlock {
  const stack: Block[] = [
    identityLeaf("name", TITLES.name),
    identityLeaf("handle", TITLES.handle),
  ];
  if (kind === "fursona") stack.push(identityLeaf("owner", TITLES.owner));
  return {
    kind: CONTAINER_KIND,
    mode: "grid",
    spaces: 2,
    weights: [1, 3],
    children: [
      identityLeaf("avatar", TITLES.avatar),
      {
        kind: CONTAINER_KIND,
        mode: "stack",
        spaces: 1,
        children: stack,
      },
    ],
  };
}

/**
 * A page with whatever required blocks it does not already name.
 *
 * **Absence means the default POSITION, not deletion**, which is the whole
 * reason no migration is needed: every page stored before the identity leaves
 * existed names none of them, and reads back with the header it always had.
 * Applied on every read path — the public pages and the editor alike — so an
 * old page renders correctly for a stranger immediately, and the editor holds
 * real blocks the moment it opens one, which makes the first save write them
 * explicitly.
 *
 * It may be deleted once every stored page carries its identity blocks, and
 * **nothing can tell you when that is** — it is a fact about the live database
 * rather than about the code, which neither `check:schema-drift` nor any test
 * can answer. The same condition `withSpacesFromColumns` carries.
 *
 * **Returns the very array it was given when nothing is missing**, by
 * reference. The editor compares what it read against what it holds to decide
 * whether a page is dirty; rebuilding a complete page would mark every page
 * dirty the moment somebody opened it.
 *
 * @param blocks - the page as stored, already parsed.
 * @param kind - which kind of actor's page it is.
 * @returns the page, with the missing required blocks added.
 */
export function withRequiredBlocks(blocks: Block[], kind: ActorKind): Block[] {
  const missing = missingRequiredKinds(blocks, kind);
  if (missing.length === 0) return blocks;

  // **The composed section only when the page names NO identity block at
  // all.** That is the migration case — every page stored before these kinds
  // existed — and it is the only one where a whole header is what somebody
  // wants back.
  //
  // A page missing only SOME of them is a page whose owner deliberately took
  // one out, and handing them the composed section would put back a second
  // portrait beside the one they kept. So a partial page gets exactly the
  // leaves it lacks, each in a section of its own, appended where they cannot
  // disturb an arrangement somebody chose.
  const identity = new Set<string>(["avatar", "handle", "owner"]);
  const missingIdentity = missing.filter((k) => identity.has(k));
  const wholeHeaderMissing =
    missingIdentity.length ===
    REQUIRED_KINDS[kind].filter((k) => identity.has(k)).length;

  const before: Block[] =
    wholeHeaderMissing && missingIdentity.length > 0
      ? [defaultIdentitySection(kind)]
      : [];
  const after: Block[] = (
    wholeHeaderMissing ? missing.filter((k) => !identity.has(k)) : missing
  ).map((k) => ({
    kind: CONTAINER_KIND,
    mode: "stack",
    spaces: 1,
    children: [identityLeaf(k, TITLES[k])],
  }));

  return [...before, ...blocks, ...after];
}

/**
 * Whether a page holds nothing its author wrote.
 *
 * **What the template picker's confirmation protects is the AUTHOR's writing**,
 * and since a page carries its required blocks from the moment it opens, "does
 * this page have any sections" stopped being that question — it is now true of
 * every page, including one nobody has typed into. Left alone, a brand-new
 * fursona would warn somebody that applying a template replaces work they had
 * not done.
 *
 * Two states answer yes, and the empty one is not merely a defensive case: a
 * page with no blocks at all has nothing to lose either, and answering no
 * there would put the confirmation in front of the emptiest page there is.
 * The other is the scaffold, compared against {@link withRequiredBlocks}' own
 * output so the two cannot drift — whatever that function seeds is what this
 * recognises, and both sides come from the same builder, so their key order is
 * the same by construction.
 *
 * **A chosen LOOK is their work too, and the blocks cannot see it.** Somebody
 * may have picked colours and touched nothing else: the page is then still
 * byte-for-byte the scaffold, so every question above answers "nothing here is
 * theirs" while a palette they chose is about to be replaced. `theme` is how
 * this function is told. It is optional so that a caller with no theme to hand
 * keeps the old behaviour rather than being forced to invent one, and it asks
 * {@link isCustomised} rather than comparing against a default, because that is
 * already the question "has this person chosen anything" and a second
 * implementation of it would drift.
 *
 * **It errs towards asking.** Anything that is not one of those two — a title
 * somebody edited, a block they moved, a second portrait — counts as theirs
 * and the picker confirms. The costly mistake is the other one: replacing a
 * page without asking.
 *
 * @param blocks - the page as the form holds it.
 * @param kind - which kind of actor's page it is.
 * @param theme - the live theme, when the caller has one. A customised theme
 *   is the author's work whatever the blocks say; an untouched or absent one
 *   decides nothing.
 * @returns true when nothing on the page is the author's.
 */
export function holdsNothingAuthored(
  blocks: readonly Block[],
  kind: ActorKind,
  theme?: ActorTheme | null,
): boolean {
  if (theme && isCustomised(theme)) return false;
  if (blocks.length === 0) return true;
  return (
    JSON.stringify(blocks) === JSON.stringify(withRequiredBlocks([], kind))
  );
}

/**
 * The required kinds this page holds exactly one of.
 *
 * **Removing any of these would leave the page incomplete**, so the editor
 * withdraws the control rather than letting somebody make a page that cannot
 * be saved and discover it at the save. A kind present twice is not locked:
 * the rule is at-least-one, and the second copy is free to go.
 *
 * Computed once over the whole tree and passed down, the way `atBlockLimit`
 * already is — so every remove control in the editor locks at the same moment,
 * and one walk answers it for every card.
 *
 * @param blocks - the whole page, as the form holds it.
 * @param kind - which kind of actor's page it is.
 * @returns the kinds whose last copy must not be removed.
 */
export function lockedKinds(
  blocks: readonly (Block | null)[],
  kind: ActorKind,
): ReadonlySet<string> {
  const counts = new Map<string, number>();
  const walk = (list: readonly (Block | null)[]): void => {
    for (const block of list) {
      if (block === null) continue;
      if (isContainer(block)) {
        walk(block.children);
        continue;
      }
      counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1);
    }
  };
  walk(blocks);
  return new Set(
    REQUIRED_KINDS[kind].filter((required) => counts.get(required) === 1),
  );
}

/**
 * Whether removing this block would take a locked kind with it.
 *
 * A container answers for everything beneath it, because removing one removes
 * its whole subtree — which is the case somebody would otherwise hit by
 * deleting the section their portrait happens to sit in.
 *
 * @param block - the block whose removal is in question.
 * @param locked - the kinds whose last copy must survive.
 * @returns true when the control should be withdrawn.
 */
export function removalLocked(
  block: Block,
  locked: ReadonlySet<string>,
): boolean {
  if (locked.size === 0) return false;
  if (!isContainer(block)) return locked.has(block.kind);
  return block.children.some(
    (child) => child !== null && removalLocked(child, locked),
  );
}
