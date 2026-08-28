import {
  BLOCK_LIMITS,
  blocksSchema,
  isContainer,
  type Block,
} from "@/features/actors/domain/block-schema";
import {
  parseTheme,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import type { BlockPath } from "@/features/actors/domain/block-edits";
import { blockProblemsFromIssues } from "@/features/actors/domain/block-problems";
import {
  REFUSED_KIND,
  type ActorKind,
} from "@/features/actors/domain/required-blocks";

/** The envelope version this build writes and is the only one it reads. */
export const DOCUMENT_VERSION = 1;

const utf8 = new TextEncoder();

/**
 * A property name that must never reach an object built from a paste.
 *
 * **`JSON.parse` does not itself pollute `Object.prototype`** — a `"__proto__"`
 * key in JSON text becomes an ordinary OWN property, confirmed against the
 * installed engine rather than assumed, because this is the exact class of
 * mistake `TIDAL_KINDS` shipped once already (see root `CLAUDE.md`). The guard
 * here is defence in depth rather than a fix for a real pollution: nothing
 * downstream of `parseDocument` should ever have to prove, of every future
 * caller, that reading a key it does not expect is harmless. A document
 * carrying one of these anywhere in its tree is refused outright rather than
 * silently stripped, because stripping would still let the rest of a hostile
 * paste through unremarked.
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Marks a thrown value as "an unsafe key was in the text", not a syntax fault. */
class UnsafeKeyError extends Error {}

/**
 * A `JSON.parse` reviver that refuses any object carrying an {@link UNSAFE_KEYS}
 * member, at any depth.
 *
 * @param key - the property name being revived.
 * @param value - the value at that key.
 * @returns `value`, unchanged — this either passes a value through or throws.
 */
function refuseUnsafeKeys(key: string, value: unknown): unknown {
  if (UNSAFE_KEYS.has(key))
    throw new UnsafeKeyError(`refused: "${key}" is not a safe key`);
  return value;
}

/**
 * The largest paste this will look at, in bytes.
 *
 * **Checked before `JSON.parse`, never after**, which is the whole reason it is
 * a separate number from {@link BLOCK_LIMITS.bytes}. The dock parses after
 * every burst of typing, so a very large paste would be parsed repeatedly and
 * freeze the tab — and the size cannot be learned from a parse that cannot be
 * afforded.
 *
 * Twice the block budget, derived rather than written, so it cannot drift from
 * it. The theme is a fixed set of fields with its own caps, so one block budget
 * of headroom is generous. The real caps still apply after the parse: this only
 * bounds what is worth reading.
 */
export const PASTE_LIMIT_BYTES = BLOCK_LIMITS.bytes * 2;

/**
 * One thing wrong with a pasted document.
 *
 * **Four kinds, because they are found by different machinery and only two of
 * them have a path.** A `syntax` failure never parsed, so there is no tree to
 * point into and claiming a path would be inventing one; an `envelope` problem
 * is about the document rather than any block in it.
 */
export type DocumentProblem =
  /**
   * The text never parsed. The engine's own message carries the position —
   * `"Unexpected token } in JSON at position 42"` — and it is passed through
   * verbatim rather than picked apart, because the format of that string is
   * the engine's to change and a parser for it would be a second thing to
   * keep in step.
   */
  | { at: "syntax"; message: string }
  /** Something about the document as a whole, apart from any one block. */
  | { at: "envelope"; message: string }
  /** One block's own field was refused by {@link blocksSchema}. */
  | { at: "block"; path: BlockPath; field: string }
  /** A leaf kind the destination actor kind does not accept. */
  | { at: "refused-kind"; path: BlockPath; kind: string };

/**
 * What a paste turned out to be.
 *
 * `theme` is null when the document carried none, which means **leave the
 * current one alone** rather than reset it — absence is inherit everywhere
 * else in this model.
 */
export type DocumentParse =
  | { ok: true; theme: ActorTheme | null; blocks: Block[] }
  | { ok: false; problems: DocumentProblem[] };

/**
 * The page as a document somebody can copy out.
 *
 * Always the object form with a version marker, so every document this app
 * produces can be recognised by a build that has never seen it. Indented,
 * because it is read and edited by people.
 *
 * @param theme - the page's theme as the form holds it.
 * @param blocks - the page's tree as the form holds it.
 * @returns the document as JSON text.
 */
export function toDocument(theme: ActorTheme, blocks: Block[]): string {
  return JSON.stringify({ aeleos: DOCUMENT_VERSION, theme, blocks }, null, 2);
}

/**
 * Every leaf in a tree whose kind the destination refuses, by path.
 *
 * @param blocks - the parsed tree.
 * @param kind - the actor kind of the page it is going into.
 * @param at - the indices above `blocks`, empty at the top of the tree.
 * @returns one problem per refused leaf, outermost first.
 */
function refusedLeaves(
  blocks: readonly (Block | null)[],
  kind: ActorKind,
  at: readonly number[] = [],
): DocumentProblem[] {
  const found: DocumentProblem[] = [];
  for (const [index, block] of blocks.entries()) {
    if (block === null) continue;
    const path = [...at, index];
    if (isContainer(block)) {
      found.push(...refusedLeaves(block.children, kind, path));
    } else if (block.kind === REFUSED_KIND[kind]) {
      found.push({ at: "refused-kind", path, kind: block.kind });
    }
  }
  return found;
}

/**
 * Reads a pasted document.
 *
 * **The size is checked before the parse** — see {@link PASTE_LIMIT_BYTES}.
 *
 * **`JSON.parse` runs with a reviver that refuses `__proto__`, `constructor`
 * and `prototype` anywhere in the text** — see {@link UNSAFE_KEYS}. A document
 * carrying one is reported the same way a syntax failure is, because refusing
 * inside the reviver is what stops the parse, and there is equally no tree to
 * point a path into.
 *
 * **The theme goes through `parseTheme`, never through `themeSchema`.** The
 * form's schema is loose on colours, the cursor and the three dials, and its
 * own documentation gives the reason: nothing else is reachable through a
 * colour input, and a slider cannot produce anything else. Both sentences are
 * statements about CONTROLS, and a paste has none — so an imported theme is
 * stored data arriving from a stranger, which is exactly what the read path
 * was written for.
 *
 * A bare array is accepted as shorthand for `{ blocks: [...] }`, because a
 * model asked for a page very often emits the array alone. That is leniency
 * about the envelope's SHAPE and never about validation: the blocks still go
 * through `blocksSchema`, and `set_actor_sections` still sees them at the save.
 *
 * **A tree nested past `blocksSchema`'s own depth cap is refused as an
 * ordinary `block` problem, never a thrown error.** `JSON.parse` itself has no
 * ceiling that {@link PASTE_LIMIT_BYTES} would let a caller reach: measured
 * against the installed engine on 2026-08-27, a bare array nested 5,000,000
 * deep — 10MB of text, far past the paste limit on its own — parsed in
 * 604ms with no ceiling found. The cap that matters is `MAX_DEPTH`, enforced
 * by `blocksSchema` the same way a save is refused, which is what
 * {@link blockProblemsFromIssues} turns into a path rather than a stack trace.
 *
 * @param text - whatever is in the box.
 * @param kind - the actor kind of the page this is going into, which decides
 *   which leaf kind is refused.
 * @returns the parsed halves, or every problem found.
 */
export function parseDocument(text: string, kind: ActorKind): DocumentParse {
  if (utf8.encode(text).length > PASTE_LIMIT_BYTES)
    return {
      ok: false,
      problems: [{ at: "envelope", message: "too large to read" }],
    };

  let raw: unknown;
  try {
    raw = JSON.parse(text, refuseUnsafeKeys);
  } catch (error) {
    return {
      ok: false,
      problems: [
        {
          at: "syntax",
          message: error instanceof Error ? error.message : "unreadable",
        },
      ],
    };
  }

  let rawBlocks: unknown;
  let rawTheme: unknown;
  if (Array.isArray(raw)) {
    rawBlocks = raw;
    rawTheme = undefined;
  } else if (typeof raw === "object" && raw !== null) {
    const envelope = raw as Record<string, unknown>;
    if (envelope.aeleos !== DOCUMENT_VERSION)
      return {
        ok: false,
        problems: [
          {
            at: "envelope",
            message:
              envelope.aeleos === undefined
                ? "no version marker"
                : `unknown version ${String(envelope.aeleos)}`,
          },
        ],
      };
    rawBlocks = envelope.blocks;
    rawTheme = envelope.theme;
  } else {
    return {
      ok: false,
      problems: [{ at: "envelope", message: "not a document" }],
    };
  }

  const parsed = blocksSchema.safeParse(rawBlocks);
  if (!parsed.success) {
    const problems = blockProblemsFromIssues(parsed.error.issues).map(
      (one): DocumentProblem => ({
        at: "block",
        path: one.path,
        field: one.field,
      }),
    );
    return {
      ok: false,
      problems:
        problems.length > 0
          ? problems
          : [
              {
                at: "envelope",
                // `blocksSchema.safeParse` failing guarantees at least one
                // issue, so this is always the array-level refusal — "too
                // many blocks" or "blocks are too large" — that produced
                // none of `problems` above.
                message: parsed.error.issues[0]!.message,
              },
            ],
    };
  }

  const refused = refusedLeaves(parsed.data, kind);
  if (refused.length > 0) return { ok: false, problems: refused };

  return {
    ok: true,
    blocks: parsed.data,
    theme: rawTheme === undefined ? null : parseTheme(rawTheme),
  };
}
