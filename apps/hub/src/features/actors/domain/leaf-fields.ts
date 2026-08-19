import {
  LEAF_KINDS,
  type LeafKind,
} from "@/features/actors/domain/block-schema";

/**
 * Which of a leaf's optional fields the renderer actually draws for one kind.
 *
 * **Every entry answers one question: would somebody see this if they wrote
 * it?** A control that accepts what a person types, stores it, refuses nothing
 * and renders nothing is the worst kind of control, because there is no way
 * for them to learn it did nothing — the rule this feature has already paid
 * for twice, in `LINKED`/`ICONED`/`PICTURED` and in the style popup's
 * card-size gate.
 *
 * `title_en` and `title_es` are not here because every kind draws a title, and
 * a set with one always-true member is a set nobody reads.
 *
 * **One entry stopped describing itself on 2026-08-19.** `icon` is the CHROME
 * for `player` and `jukebox` rather than a glyph, so the editor draws a
 * different control for those two — see {@link RETRO}. This table's job is to
 * say what the RENDERER reads, which is what `leaf-fields.test.tsx` measures;
 * which control the editor offers is a separate decision.
 */
export interface LeafFields {
  /**
   * Whether the description is drawn.
   *
   * False for `social` alone, whose sub-line is the handle `resolveSocial`
   * derived from the address — all a branded chip has room for. Its editor
   * must therefore offer no description at all.
   */
  description: boolean;
  /** Whether `link_url` is read. */
  link: boolean;
  /**
   * Whether that address can become an embedded player or post.
   *
   * Narrower than {@link link} on purpose, and the difference is what the
   * field's hint may promise: `player` and `post` frame what they recognise,
   * while `link` and `social` always draw a button or a chip whatever host was
   * pasted. One hint vague enough to cover both would be true of neither.
   */
  embeds: boolean;
  /**
   * Whether `icon` is drawn.
   *
   * True for `embed` as well as for `link` and `social`, which reads as wrong
   * until you know why: an address it cannot frame falls back to a branded
   * chip, and the chip draws the icon. That is not a rare state —
   * `embed.bsky.app` hard-refuses the handle a pasted Bluesky address carries,
   * so a Bluesky embed is ALWAYS the chip. Measured rather than reasoned:
   * `leaf-fields.test.tsx` draws each kind in every state its own renderer can
   * reach.
   *
   * **True for `player` and `jukebox` too, and there it is not an icon at
   * all** — it names the CHROME. See {@link RETRO}, which is also where the
   * editor's obligation to draw a different control for it is written down.
   */
  icon: boolean;
  /** Whether `image_url` is drawn. */
  picture: boolean;
  /** Whether `rows` are drawn. */
  rows: boolean;
}

/**
 * What both retro players draw: a playlist, and a chrome to draw it in.
 *
 * **`icon` here is the CHROME, not an icon**, and that is the one place this
 * table's names stop describing themselves. `chromes.ts` holds the roster and
 * `icon` stores which one — so the editor offers a CHROME PICKER for these
 * kinds rather than the glyph picker every other `icon: true` kind gets. The
 * table's job is to say what the RENDERER reads, which is what
 * `leaf-fields.test.tsx` measures; which control the editor draws for it is a
 * separate decision, and for these two it is a different control.
 *
 * **The SKIN is deliberately absent from this table.** A `jukebox` wearing the
 * Winamp chrome reads `link_url` as a `.wsz` address — but the sheets arrive
 * from a FETCH in an effect, so writing one changes no static markup and this
 * table cannot honestly claim it is read. It gets a bespoke control with a live
 * preview instead, which is where the "somebody can see what it did"
 * obligation is met for it. Saying `link: true` here would make
 * `leaf-fields.test.tsx` assert something it has no way to observe.
 */
const RETRO: LeafFields = {
  description: true,
  link: false,
  embeds: false,
  icon: true,
  picture: false,
  rows: true,
};

/** Nothing optional, and a description — what a plain card shows. */
const PLAIN: LeafFields = {
  description: true,
  link: false,
  embeds: false,
  icon: false,
  picture: false,
  rows: false,
};

/**
 * What each content kind draws, by the name stored on the leaf.
 *
 * **Read off `blocks.tsx` rather than reasoned about**, and pinned to it by
 * `leaf-fields.test.tsx`, which draws each kind in every state its own
 * renderer can reach — with a field written and without — and fails when the
 * markup differs for a field this table calls unread, or fails to differ for
 * one it calls read. A table like this is exactly the kind that goes stale
 * silently: the renderer moves, nothing about these types changes, and
 * `check:docs` has nothing to compare. That guard is the whole reason it is
 * safe to state the answer here rather than in the component.
 *
 * **A `Map`, not a record.** A leaf's `kind` is wider than {@link LeafKind} —
 * the lenient read admits a name this build does not know — so this is indexed
 * by text that came out of `jsonb`, which is the shape that put `__proto__`
 * through `TIDAL_KINDS` and shipped a Critical. A `Map` has no inherited
 * entries to find.
 *
 * The private object below is a compile-time check and is never indexed:
 * `satisfies Record<LeafKind, …>` fails to compile the moment `LEAF_KINDS`
 * gains a member with no entry here, so a kind cannot reach the editor with no
 * opinion about its own fields.
 *
 * `embed` is what `post` was renamed to, and it carries what `player` used to;
 * `player` and `jukebox` are the retro players and share {@link RETRO}.
 */
export const LEAF_FIELDS: ReadonlyMap<string, LeafFields> = new Map(
  Object.entries({
    text: PLAIN,
    link: { ...PLAIN, link: true, icon: true },
    picture: { ...PLAIN, picture: true },
    player: RETRO,
    jukebox: RETRO,
    embed: { ...PLAIN, link: true, embeds: true, icon: true },
    social: { ...PLAIN, description: false, link: true, icon: true },
    stat: PLAIN,
    quote: PLAIN,
    progress: PLAIN,
    table: { ...PLAIN, rows: true },
  } satisfies Record<LeafKind, LeafFields>),
);

/**
 * What a kind draws, including one this build has never heard of.
 *
 * A kind outside the vocabulary renders as a plain card — the renderer's own
 * `LEAVES` lookup falls back to its plain leaf — so the honest answer for one
 * is a title and a description and nothing else. That is reachable: the lenient read admits a name a newer
 * deployment wrote, and its author must still be able to open their page and
 * read what is on it.
 *
 * @param kind - the name stored on the leaf.
 * @returns which optional fields it draws.
 */
export function leafFields(kind: string): LeafFields {
  return LEAF_FIELDS.get(kind) ?? PLAIN;
}

/**
 * The kinds whose editor offers a description, in vocabulary order.
 *
 * **Exported so the label bag can be built by mapping it**, which is what
 * makes a missing catalogue entry a failing test rather than a raw key on
 * somebody's screen: `messages.test.ts` compares the two catalogues key by
 * key, and a name absent from BOTH leaves them equal. Listing the kinds by
 * hand in `pages/labels.ts` is how the flat editor once shipped a layout whose
 * name rendered as `fursonas.types.progress` at 155px, overflowing a phone.
 */
export const DESCRIBED_KINDS: readonly LeafKind[] = LEAF_KINDS.filter(
  (kind) => leafFields(kind).description,
);
