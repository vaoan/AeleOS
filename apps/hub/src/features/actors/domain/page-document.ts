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

/**
 * Thrown by {@link refuseUnsafeKeys} when the parsed text carries one of
 * {@link UNSAFE_KEYS}.
 *
 * **Caught by name in `parseDocument`**, which is what turns this into the
 * `unsafe-key` {@link DocumentProblem} rather than the generic `syntax` one —
 * telling somebody their JSON has a syntax error at a position that is
 * perfectly fine would be worse than not checking at all, and a later dock
 * renders these problems to a person. `key` carries the offending name so that
 * sentence can say which one.
 */
class UnsafeKeyError extends Error {
  constructor(readonly key: string) {
    super(`refused: "${key}" is not a safe key`);
  }
}

/**
 * A `JSON.parse` reviver that refuses any object carrying an {@link UNSAFE_KEYS}
 * member, at any depth.
 *
 * @param key - the property name being revived.
 * @param value - the value at that key.
 * @returns `value`, unchanged — this either passes a value through or throws.
 */
function refuseUnsafeKeys(key: string, value: unknown): unknown {
  if (UNSAFE_KEYS.has(key)) throw new UnsafeKeyError(key);
  return value;
}

/**
 * What a parsed document's outer shape turned out to hold, or the one
 * {@link DocumentProblem} that shape itself is refused for.
 *
 * **Extracted out of `parseDocument` to keep its own cognitive complexity
 * under the linter's cap**, not because this shape is reused anywhere else.
 * `rawTheme` is `undefined` for the bare-array shorthand, which carries no
 * theme at all — the same reading `isMalformedTheme` and `parseDocument`'s own
 * theme handling already give an omitted key.
 */
type ResolvedEnvelope =
  | { ok: true; rawBlocks: unknown; rawTheme: unknown }
  | { ok: false; problem: DocumentProblem };

/**
 * Reads a parsed value's outer shape — the bare-array shorthand, or an
 * object envelope naming a version, blocks and a theme — before anything
 * inside `blocks` or `theme` is looked at.
 *
 * @param raw - whatever `JSON.parse` returned.
 * @returns the two raw halves to validate next, or the one problem that rules
 *   out looking at them at all.
 */
function resolveEnvelope(raw: unknown): ResolvedEnvelope {
  if (Array.isArray(raw))
    return { ok: true, rawBlocks: raw, rawTheme: undefined };

  if (typeof raw !== "object" || raw === null)
    return {
      ok: false,
      problem: { at: "envelope", message: "not a document" },
    };

  const envelope = raw as Record<string, unknown>;
  if (envelope.aeleos !== DOCUMENT_VERSION)
    return {
      ok: false,
      problem: {
        at: "envelope",
        message:
          envelope.aeleos === undefined
            ? "no version marker"
            : `unknown version ${String(envelope.aeleos)}`,
      },
    };

  return { ok: true, rawBlocks: envelope.blocks, rawTheme: envelope.theme };
}

/**
 * Whether a parsed `theme` value is something {@link parseTheme} must never
 * see — anything that is not absent and not a plain object.
 *
 * **Extracted out of `parseDocument` for its own sake, not only for
 * complexity.** `parseTheme` coerces anything that is not a plain object — an
 * array, a string, a number — to `{}` and answers an all-defaults theme, so a
 * malformed `theme` reaching it resets the author's palette exactly as a bare
 * `"theme": null` would, on an input that is more clearly wrong rather than
 * less. `null` and `undefined` are the two values this returns `false` for —
 * both already mean "leave the current theme alone" — everywhere else in
 * `parseDocument`.
 *
 * @param value - `envelope.theme` as parsed, or `undefined` for the
 *   bare-array shorthand, which carries no theme at all.
 * @returns `true` for an array or any non-object value other than `null` or
 *   `undefined`.
 */
function isMalformedTheme(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    (typeof value !== "object" || Array.isArray(value))
  );
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
 * **Five kinds, because they are found by different machinery and only two of
 * them have a path.** A `syntax` failure never parsed, so there is no tree to
 * point into and claiming a path would be inventing one; `unsafe-key` is found
 * by the same reviver mid-parse and is equally pathless; an `envelope` problem
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
  /**
   * The text carried `__proto__`, `constructor` or `prototype` as a key,
   * anywhere. See {@link UNSAFE_KEYS}. Reported by name rather than folded
   * into `syntax`, so a person is told which key rather than shown a position
   * that is not actually wrong.
   */
  | { at: "unsafe-key"; key: string }
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
 * else in this model. An explicit `"theme": null` reads the same way: the
 * most plausible reading of a document that names the key and gives it
 * nothing is "no theme here", and resetting somebody's colours on that
 * ambiguity is the destructive reading.
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
 * carrying one is reported as the `unsafe-key` {@link DocumentProblem}, caught
 * by narrowing on {@link UnsafeKeyError} rather than folded into a generic
 * parse failure — a wrong position would tell somebody their JSON has a syntax
 * error where it does not.
 *
 * **The theme goes through `parseTheme`, never through `themeSchema`.** The
 * form's schema is loose on colours, the cursor and the three dials, and its
 * own documentation gives the reason: nothing else is reachable through a
 * colour input, and a slider cannot produce anything else. Both sentences are
 * statements about CONTROLS, and a paste has none — so an imported theme is
 * stored data arriving from a stranger, which is exactly what the read path
 * was written for. An explicit `"theme": null` is read as absent, the same as
 * an omitted key — both mean "leave the current theme alone" rather than
 * "reset it", since a document naming the key and giving it nothing most
 * plausibly means there is no theme here.
 *
 * **A `theme` that is present but not an object — `[]`, a string, a number —
 * is refused as its own `envelope` problem, before `parseTheme` ever sees
 * it, and a whole-branch review found this missing.** `parseTheme` treats
 * anything that is not a plain object as `{}` and answers an all-defaults
 * theme, which is the same destructive reset `null` is refused above for
 * arriving on an input that is more clearly malformed rather than less —
 * `"theme": []` is not an ambiguous absence, it is a wrong shape.
 *
 * A bare array is accepted as shorthand for `{ blocks: [...] }`, because a
 * model asked for a page very often emits the array alone. That is leniency
 * about the envelope's SHAPE and never about validation: the blocks still go
 * through `blocksSchema`, and `set_actor_sections` still sees them at the save.
 *
 * **A tree nested past `blocksSchema`'s own depth cap is refused as an
 * `envelope` problem naming `"too deep"`, never a thrown error.** The cap that
 * matters day to day is `MAX_DEPTH`, enforced by `blocksSchema` the same way a
 * save is refused. That refusal's own issue path ends in a NUMBER, not a field
 * name — `[0, "children", 0, "children", 0, "children", 0]` for a chain nested
 * past the cap — so {@link blockProblemsFromIssues} finds no field to mark and
 * it surfaces through the same array-level fallback `"too many blocks"` does,
 * rather than as a `block` problem naming a field nobody typed.
 *
 * **`JSON.parse` itself has no ceiling reachable within {@link
 * PASTE_LIMIT_BYTES} — but only for a plain call with no reviver, which is not
 * what this function makes.** Measured against the installed engine on
 * 2026-08-27, a bare array nested 5,000,000 deep — 10MB of text, far past the
 * paste limit on its own — parsed in 604ms with no ceiling found. Handing
 * `JSON.parse` the `refuseUnsafeKeys` reviver changes that: the engine then
 * walks the parsed value calling the reviver on every property, and THAT walk
 * recurses in JS rather than in native code — so it has the ordinary stack
 * limit a hand-written recursive walk would. Measured with the reviver
 * attached, against the container shape a real page nests (one child per
 * level): the first depth to throw a `RangeError` is **857** inside this
 * repo's own vitest worker; in plain Node the last depth still accepted is
 * **862**, so the first to throw there is **863** — both on 2026-08-27, the
 * small gap being ordinary variance from how much stack the host process had
 * already spent. That depth is reachable
 * within the paste budget: a chain of 2,000 such containers serialises to
 * about 120KB, still under the 128KB cap, so a paste that looks merely large
 * can exhaust the stack. **It cannot escape as an uncaught throw.**
 * `RangeError` is an `Error`, so the same `catch` below that reports a genuine
 * `SyntaxError` reports this one too, as an ordinary `syntax` problem carrying
 * the engine's own message — the reviver's safety property costs a much lower
 * practical depth ceiling, and that cost is absorbed by the same path that
 * already had to handle a parse failure.
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
    if (error instanceof UnsafeKeyError)
      return { ok: false, problems: [{ at: "unsafe-key", key: error.key }] };
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

  const envelope = resolveEnvelope(raw);
  if (!envelope.ok) return { ok: false, problems: [envelope.problem] };
  const { rawBlocks, rawTheme } = envelope;

  // A `theme` that is neither absent nor an object is refused here, before it
  // ever reaches `parseTheme` — see {@link isMalformedTheme}'s own TSDoc for
  // why.
  if (isMalformedTheme(rawTheme))
    return {
      ok: false,
      problems: [{ at: "envelope", message: "theme is not an object" }],
    };

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
                // issue, so joining every issue's own message is always a
                // non-empty string — no indexed access, and so nothing to
                // assert non-null about. This is the array-level refusal —
                // "too many blocks", "blocks are too large", or a subtree
                // refused past `MAX_DEPTH` — that produced none of `problems`
                // above.
                message: parsed.error.issues.map((i) => i.message).join("; "),
              },
            ],
    };
  }

  const refused = refusedLeaves(parsed.data, kind);
  if (refused.length > 0) return { ok: false, problems: refused };

  return {
    ok: true,
    blocks: parsed.data,
    theme:
      rawTheme === undefined || rawTheme === null ? null : parseTheme(rawTheme),
  };
}
