import {
  BLOCK_LIMITS,
  BLOCK_STYLE_LIMITS,
  CONTAINER_KIND,
  CONTAINER_MODES,
  LEAF_KINDS,
  MAX_DEPTH,
  type Block,
  type ContainerMode,
  type LeafKind,
} from "@/features/actors/domain/block-schema";
import {
  PAGE_FONTS,
  PAGE_MEASURES,
  PAGE_SPACINGS,
} from "@/features/actors/domain/actor-theme";
import { SKINS } from "@/shared/domain/skins";
import {
  REFUSED_KIND,
  REQUIRED_KINDS,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";
import {
  DOCUMENT_VERSION,
  PASTE_LIMIT_BYTES,
} from "@/features/actors/domain/page-document";

/**
 * What each container mode DOES, in one line, for a reader who has never seen
 * this model.
 *
 * **Hand-written, and gated.** Every list and cap in {@link pageReference} is
 * interpolated from the constants that are already authoritative, so it cannot
 * go stale; a mode's MEANING cannot be derived from a type, so it is written
 * here instead, and `page-reference.test.ts` fails the build when a mode is
 * added without one. A reference that has gone stale is worse than none,
 * because the thing reading it — a language model — believes it completely.
 *
 * `satisfies Record<ContainerMode, string>` is what makes the gate structural
 * as well as tested: adding a mode to {@link CONTAINER_MODES} stops this file
 * compiling until a line is added here too.
 */
export const MODE_MEANINGS = {
  stack:
    "lays children one after another down the page — the resting, default arrangement",
  list: "lays children in a single column with a hairline between rows and no gap, the shape a modern feed uses",
  grid: "lays children across a fixed number of equal tracks, wrapping into more rows as more are added",
  masonry:
    "packs children into columns by height, so a short entry is followed immediately by whatever comes next rather than waiting for a taller neighbour",
  carousel:
    "lays children in a single row that scrolls sideways, at every width",
  tabs: "shows one child at a time, chosen by a tab — only one panel is visible",
  accordion:
    "shows every child as a collapsible panel; any number may be open at once",
  timeline: "lays children as a marked, ordered sequence",
} as const satisfies Record<ContainerMode, string>;

/**
 * What each leaf kind HOLDS, in one line, for a reader who has never seen this
 * model.
 *
 * **Hand-written, and gated**, for the same reason {@link MODE_MEANINGS} is —
 * see its own note. `satisfies Record<LeafKind, string>` stops this file
 * compiling the moment {@link LEAF_KINDS} gains a member with no line here.
 *
 * Each line is written fresh from what the renderer actually does today, not
 * copied from `block-schema.ts`'s own TSDoc: that comment carries history,
 * corrections and the account of a rename (`post` became `embed`), which is
 * exactly the kind of material a reader with no memory of any of it should
 * never be handed as though it were the current behaviour.
 */
export const KIND_MEANINGS = {
  text: "a paragraph of the author's own prose — a heading and a body",
  link: "a button pointing somewhere else, with its own label and an address",
  picture: "one picture",
  player:
    "a retro media player of AeleOS's own, with a video pane, playing a playlist of audio and video files",
  jukebox:
    "a retro music player of AeleOS's own, audio only, playing a playlist of audio files",
  embed:
    "somebody else's own embed — YouTube, Spotify, Tidal, Twitch, Instagram, Mastodon and more — framed from an allowlisted provider",
  social:
    "a branded chip linking out to a profile elsewhere, labelled by whichever brand its address matches, or by its own hostname when none does",
  stat: "one fact — the description is the big value and the title is its label, the pair inverted from every other kind",
  quote:
    "a quotation — the description is what was said and the title is who said it, the pair inverted from every other kind",
  progress:
    "one measured thing drawn as a bar — the title labels it and the description (a fraction, a percentage or a number) sets how full the bar is",
  table: "rows of paired cells — the only kind that reads its own `rows` field",
  avatar:
    "the actor's own portrait, resolved by the page rather than typed in — its title is the picture's alt text",
  handle:
    "the actor's own address, resolved by the page rather than typed in — its title labels the value",
  name: "the actor's own display name, resolved by the page rather than typed in — its title labels the value, and it may render nothing at all when no name is set",
  owner:
    "a link to the fursona's owner, resolved by the page rather than typed in — required on a fursona's page and refused on a person's",
  fursonas:
    "the list of a person's own public fursonas, resolved by the page rather than typed in — required on a person's page and refused on a fursona's",
} as const satisfies Record<LeafKind, string>;

/**
 * The leaf kinds that draw the actor rather than what somebody typed.
 *
 * A subset of {@link LEAF_KINDS} named here rather than derived, because
 * "draws the actor" is a fact about what a kind reads, not something the
 * vocabulary array itself carries — {@link LEAF_KINDS} has no such marker, on
 * purpose, since adding one would be exactly the kind of welding this model
 * exists to avoid.
 */
const IDENTITY_KINDS: readonly LeafKind[] = [
  "avatar",
  "handle",
  "name",
  "owner",
  "fursonas",
];

/**
 * One leaf, carrying only the title every leaf must have.
 *
 * @param kind - the leaf kind.
 * @param title - its title, in English.
 * @returns the leaf, for {@link exampleBlocks}.
 */
function exampleLeaf(kind: LeafKind, title: string): Block {
  return { kind, title_en: title, description_en: "" };
}

/**
 * A small, complete page for the worked example — valid for the given actor
 * kind and refused for the other.
 *
 * **Kind-dependent on purpose.** A person's page requires `fursonas` and
 * refuses `owner`; a fursona's page is the mirror. One example cannot be
 * valid for both, so the reference's worked example is built for whichever
 * kind it was generated for — see {@link pageReference}.
 *
 * The shape mirrors what `withRequiredBlocks` seeds in practice: a header
 * pairing a portrait with a stack of the name, the handle and — on a
 * fursona's page only — the owner; an "About" section; and, on a person's
 * page only, a section naming their fursona list separately, because
 * `fursonas` is not part of the header either.
 *
 * @param kind - which actor kind the example is for.
 * @returns the page's blocks.
 */
function exampleBlocks(kind: ActorKind): Block[] {
  const stackChildren: Block[] = [
    exampleLeaf("name", "Name"),
    exampleLeaf("handle", "Handle"),
  ];
  if (kind === "fursona") stackChildren.push(exampleLeaf("owner", "Owner"));

  const header: Block = {
    kind: CONTAINER_KIND,
    mode: "grid",
    spaces: 2,
    children: [
      exampleLeaf("avatar", "Portrait"),
      {
        kind: CONTAINER_KIND,
        mode: "stack",
        spaces: 1,
        children: stackChildren,
      },
    ],
  };

  const about: Block = {
    kind: CONTAINER_KIND,
    mode: "stack",
    spaces: 1,
    name_en: "About",
    children: [
      {
        kind: "text",
        title_en: "About",
        description_en: "Write something about this page here.",
      },
    ],
  };

  if (kind === "person") {
    const fursonas: Block = {
      kind: CONTAINER_KIND,
      mode: "stack",
      spaces: 1,
      name_en: "Fursonas",
      children: [exampleLeaf("fursonas", "Fursonas")],
    };
    return [header, about, fursonas];
  }

  return [header, about];
}

/**
 * One line describing what a key of the block style bag accepts.
 *
 * Built from {@link BLOCK_STYLE_LIMITS} rather than restated, so a value
 * added or renamed there changes what this prints without anybody having to
 * remember to update a second copy.
 *
 * @param key - the style key's name.
 * @param limit - the value {@link BLOCK_STYLE_LIMITS} holds for it: a list of
 *   the values it accepts, or a character cap.
 * @returns the line.
 */
function styleLimitLine(
  key: string,
  limit: readonly string[] | number,
): string {
  if (Array.isArray(limit)) {
    const options = limit.map((value) => "`" + value + "`").join(", ");
    return `- \`${key}\`: one of ${options}`;
  }
  return `- \`${key}\`: up to ${limit} characters`;
}

/**
 * The page format, described for an AI assistant authoring or editing one —
 * a person's page, or a fursona's.
 *
 * **Every list and cap below is interpolated from the constants this module
 * imports, never typed out by hand.** Only the one-line MEANING of each
 * container mode and leaf kind is hand-written, in {@link MODE_MEANINGS} and
 * {@link KIND_MEANINGS}, because a meaning cannot be derived from a type —
 * and `page-reference.test.ts` fails the build the day either vocabulary
 * gains a member with no meaning written for it. A reference that has gone
 * stale is worse than none, because the thing reading it believes it
 * completely.
 *
 * **The worked example is generated for the given `kind` and goes through
 * the real `parseDocument`** — proved in the test file, which is what keeps
 * this function from ever handing out an example this build itself refuses.
 * A person's page and a fursona's page require and refuse different leaf
 * kinds, so the example — and the rules section above it — differ by `kind`
 * rather than describing one page shape for both.
 *
 * @param kind - which kind of actor's page this reference is being generated
 *   for. Decides which leaf kinds section 5 says are required and refused,
 *   and which shape the worked example takes.
 * @returns the reference, as plain text a person can hand to an assistant.
 */
export function pageReference(kind: ActorKind): string {
  const modeRows = CONTAINER_MODES.map(
    (mode) => `- \`${mode}\` — ${MODE_MEANINGS[mode]}`,
  ).join("\n");

  const kindRows = LEAF_KINDS.map(
    (leaf) => `- \`${leaf}\` — ${KIND_MEANINGS[leaf]}`,
  ).join("\n");

  const identityRows = IDENTITY_KINDS.map(
    (leaf) => `- \`${leaf}\` — ${KIND_MEANINGS[leaf]}`,
  ).join("\n");

  const required = REQUIRED_KINDS[kind];
  const refused = REFUSED_KIND[kind];
  const other: ActorKind = kind === "person" ? "fursona" : "person";

  const styleRows = Object.entries(BLOCK_STYLE_LIMITS)
    .map(([key, limit]) => styleLimitLine(key, limit))
    .join("\n");

  const example = JSON.stringify(
    { aeleos: DOCUMENT_VERSION, blocks: exampleBlocks(kind) },
    null,
    2,
  );

  return `# The AeleOS page format (for a ${kind}'s page)

This describes the JSON document an AeleOS page is written as, so that an
assistant can author or edit one on somebody's behalf. Every list and number
below is generated from this build's own source, so it cannot describe a
capability this build does not have.

## 1. What a document is

A document is one JSON object with three keys:

- \`aeleos\`: the version marker. This build writes and reads exactly
  \`${DOCUMENT_VERSION}\`; any other value, or a missing key, is refused.
- \`theme\`: the page's colours, canvas, skin and layout — described in
  section 7. Omitting this key, or setting it to \`null\`, means "leave the
  page's existing theme alone" rather than resetting it.
- \`blocks\`: the tree of content described in sections 2 through 5.

As a shorthand, a bare JSON array is also accepted in place of the whole
object, and is read as though it were \`blocks\` with no \`theme\` named. It is
leniency about the envelope's shape only — the array still has to satisfy
everything below.

## 2. Containers — arrangement

A **container** arranges other blocks; it holds no content of its own. Its
\`kind\` is always \`"container"\`. It carries:

- \`mode\`: how it arranges its children. One of:

${modeRows}

- \`spaces\`: how many places it lays out ACROSS, from 1 to ${BLOCK_LIMITS.spaces}.
  **This is a width, never a capacity.** Children fill the places row by row
  and the container grows downward, so a section of fifty pictures three
  across is three spaces and seventeen rows, not a section nobody can build.
  Narrowing \`spaces\` re-wraps existing children into more rows and loses
  nothing.
- \`weights\` (optional): one whole share per place, each from 1 to
  ${BLOCK_LIMITS.weight}, so \`spaces: 3\` with \`weights: [1, 3, 1]\` lays a
  narrow place, one three times as wide, and a narrow place. Omitting it
  means every place is the same width. It belongs on the PARENT, not on the
  child that sits in the place.
- \`children\`: an array, one entry per place, filling row by row. An entry
  may be \`null\` — an empty place that keeps its width on the page and draws
  nothing, which is different from a shorter array. A container may hold up
  to ${BLOCK_LIMITS.children} children across every one of its rows.
- \`name_en\` / \`name_es\` (optional): a heading drawn over the container.
  **A section is simply a container at the top of the page (depth 0) that
  usually carries one of these.**
- \`style\` (optional): see section 6.

## 3. Leaves — content

A **leaf** is one piece of content. Its \`kind\` is one of:

${kindRows}

Every leaf carries \`title_en\` (required, non-empty) and \`description_en\`
(may be empty); both may also carry a Spanish counterpart, \`title_es\` /
\`description_es\`, which is the author's own writing and not a required
translation. Depending on the kind, a leaf may also carry \`icon\`,
\`image_url\`, \`link_url\` or \`rows\` (\`table\` is the only kind that reads
\`rows\`).

## 4. The identity kinds — content that is not typed in

Five of the kinds above draw the ACTOR itself rather than words the author
typed:

${identityRows}

Because these resolve from whoever owns the page rather than from typed
text, one document containing them renders correctly for whoever it is
imported for — which is what makes a shared document behave as a template
rather than as one specific page.

## 5. The rules for a ${kind}'s page

This reference was generated for a **${kind}**'s page. A ${kind}'s page must
carry at least one of each of: ${required.map((one) => `\`${one}\``).join(", ")}
— any number of copies, at any depth, in any container. A ${kind}'s page
refuses the \`${refused}\` kind outright: it has nothing to render on a
${kind}'s page, only on a ${other}'s.

## 6. A block's own style (optional)

Any block, container or leaf, may carry an optional \`style\` object. None of
its keys are required, and an absent key means "inherit whatever encloses
this" rather than a blank value:

${styleRows}

Two of these are depth-0 only (meaningful on a section, not on a block
nested inside one): \`bleed\` reaches both edges of the page rather than the
theme's measure, and \`margins: false\` removes that section's own side gutter
and the spacing before or after its neighbours.

## 7. Caps

- A container may nest up to ${MAX_DEPTH} levels deep, the top-level section
  counting as the first: section → container → container → leaves only.
  Nesting one level past that is refused by name.
- A page may hold up to ${BLOCK_LIMITS.blocks} blocks in total, counting every
  depth.
- A \`table\` leaf may hold up to ${BLOCK_LIMITS.rows} rows of up to
  ${BLOCK_LIMITS.cells} cells each.
- Any one text field (a title, a description, a table cell) holds up to
  ${BLOCK_LIMITS.text} characters.
- The whole serialised page — every block, byte for byte as UTF-8 — must fit
  in ${BLOCK_LIMITS.bytes} bytes.
- A pasted document larger than ${PASTE_LIMIT_BYTES} bytes is refused before
  it is even parsed.

## 8. The theme

- \`skin\`: the page's form — corners, borders, shadow and texture. One of
  ${SKINS.map((skin) => `\`${skin}\``).join(", ")}.
- \`measure\`: how wide the page's content column is. One of
  ${PAGE_MEASURES.map((measure) => `\`${measure}\``).join(", ")}.
- \`font\`: the page's typeface. One of
  ${PAGE_FONTS.map((font) => `\`${font}\``).join(", ")}.
- \`spacing\`: how tightly the page sets its own content. One of
  ${PAGE_SPACINGS.map((spacing) => `\`${spacing}\``).join(", ")}.
- Every colour in the theme is written as \`#rrggbb\`. Anything else is
  dropped rather than refused, and the page falls back to its previous
  colour, or the design's own.

Any theme key this document omits, or sets to \`null\`, is left exactly as it
already is on the page.

## A worked example, for a ${kind}'s page

This is a complete, valid document for a ${kind}'s page:

\`\`\`json
${example}
\`\`\`
`;
}
