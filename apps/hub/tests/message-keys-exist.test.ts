import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import en from "@/shared/infrastructure/i18n/messages/en.json";
import es from "@/shared/infrastructure/i18n/messages/es.json";

// THE KEY THAT WAS IN NEITHER CATALOGUE.
//
// `messages.test.ts` compares en against es, so a key missing from BOTH passes
// it — the root `CLAUDE.md` records that exact hole, and the answer it reached
// was to pin each VOCABULARY (modes, leaf kinds, skins, canvases) against its
// catalogue. That closes the hole for names generated from a list and leaves it
// wide open for a key somebody typed by hand.
//
// One was typed by hand. Three signed-in routes ask `getTranslations("fursonas")`
// for `t("fursonas")` to title the fursona list, and `fursonas.fursonas` existed
// in neither language — only `publicProfile.fursonas` did, under a different
// namespace. next-intl's answer to a missing message is to log and render the
// KEY PATH, so the editor drew the string `fursonas.fursonas` at somebody where
// a heading belonged. That is the same fault this repository already paid for
// once, when `fursonas.types.<id>` rendered at 155px and overflowed a 320px
// viewport.
//
// **This guard reads the source rather than a list**, which is what lets it
// cover a hand-written key at all: it finds every translator bound to a literal
// namespace and every literal key asked of that translator, and requires the
// pair to resolve in both catalogues. A key built by interpolation is invisible
// to it and deliberately so — `messages.test.ts` pins those against their
// vocabularies, which is the stronger check where it applies.
//
// It asserts its own regexes matched something before comparing anything, for
// the reason `block-limits-match-migration.test.ts` gives: a pattern that
// quietly matches nothing makes every comparison after it pass forever.

/** Where the app's own source lives, from vitest's cwd (`apps/hub`). */
const SRC = resolve(process.cwd(), "src");

/**
 * Every TypeScript file under a directory, recursively.
 *
 * @param dir - the directory to walk.
 * @returns absolute paths of every `.ts` and `.tsx` file beneath it.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** A translator variable bound to a literal namespace, and a key asked of it. */
interface Ask {
  /** The file that asks, relative to `src`, so a failure names it. */
  file: string;
  /** The dot-joined path the call resolves to. */
  key: string;
}

/** One `const t = …Translations("ns")`, and where in the file it sits. */
interface Binding {
  /** The variable the translator was bound to. */
  variable: string;
  /** The namespace it was bound to. */
  namespace: string;
  /** Its offset, which is what makes a second binding of `t` resolvable. */
  at: number;
}

/**
 * Every translator bound to a LITERAL namespace in one file, in file order.
 *
 * Both call shapes are read. `getTranslations("ns")` is the common one, and
 * `getTranslations({ locale, namespace: "ns" })` is what `generateMetadata`
 * uses — missing that second form is not merely a gap in coverage, it produces
 * WRONG answers, because the variable it binds is almost always also called
 * `t` and its keys would otherwise be attributed to whatever namespace the
 * component below it binds.
 *
 * @param source - the file's text.
 * @returns every binding, sorted by position.
 */
function bindingsIn(source: string): Binding[] {
  const patterns = [
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:get|use)Translations\(\s*"([^"]+)"\s*\)/g,
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:get|use)Translations\(\s*\{[^}]*namespace:\s*"([^"]+)"[^}]*\}\s*\)/g,
  ];
  return patterns
    .flatMap((pattern) => [...source.matchAll(pattern)])
    .map((found) => ({
      variable: found[1]!,
      namespace: found[2]!,
      at: found.index,
    }))
    .sort((one, other) => one.at - other.at);
}

/**
 * Every literal key a file asks of a translator, resolved to its namespace.
 *
 * **A call resolves against the NEAREST PRECEDING binding of its own
 * variable**, rather than against every binding in the file. One module
 * routinely binds `t` twice — once in `generateMetadata` and once in the
 * component — and pairing each call with both namespaces reports the keys of
 * one as missing from the other. That is a guard that cries wolf, which is
 * worse than no guard: it gets relaxed, and then it is checking nothing.
 *
 * `t.rich`, `t.raw` and `t.markup` resolve the same key as `t` itself, so they
 * are read too — a rich heading missing from a catalogue is as blank as a
 * plain one. A key built by interpolation is invisible here on purpose; those
 * are pinned against their vocabularies in `messages.test.ts`.
 *
 * @param source - the file's text.
 * @param file - its path, for the failure message.
 * @returns every namespace-and-key pair the file asks for by literal.
 */
function asksIn(source: string, file: string): Ask[] {
  const bindings = bindingsIn(source);
  if (bindings.length === 0) return [];
  const names = new Set(bindings.map((binding) => binding.variable));

  const asks: Ask[] = [];
  for (const call of source.matchAll(
    /\b(\w+)(?:\.(?:rich|raw|markup))?\(\s*"([^"]+)"/g,
  )) {
    const variable = call[1]!;
    if (!names.has(variable)) continue;
    const bound = bindings.findLast(
      (binding) => binding.variable === variable && binding.at < call.index,
    );
    if (bound) asks.push({ file, key: `${bound.namespace}.${call[2]!}` });
  }
  return asks;
}

const asks = sourceFiles(SRC).flatMap((path) =>
  asksIn(readFileSync(path, "utf8"), path.slice(SRC.length + 1)),
);

/**
 * Reads a dot-joined key out of a catalogue.
 *
 * @param catalogue - the catalogue to read from.
 * @param key - the dot-joined path.
 * @returns the value at that path, or undefined when nothing is there.
 */
function valueAt(catalogue: Record<string, unknown>, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (current, part) => (current as Record<string, unknown>)?.[part],
      catalogue,
    );
}

describe("every message key the app asks for by name", () => {
  // The self-check. These numbers are floors rather than counts, so ordinary
  // work does not have to update them — but a regex that stopped matching, or
  // a rename of next-intl's own accessors, drops them to zero and is reported
  // here rather than as a suite that silently checks nothing.
  it("found translators and keys to check at all", () => {
    expect(asks.length).toBeGreaterThan(50);
    expect(new Set(asks.map((ask) => ask.file)).size).toBeGreaterThan(5);
  });

  it.each(["en", "es"])("resolves in %s", (locale) => {
    const catalogue = (locale === "en" ? en : es) as Record<string, unknown>;
    const missing = asks
      .filter((ask) => typeof valueAt(catalogue, ask.key) !== "string")
      .map((ask) => `${ask.key} (${ask.file})`);
    expect([...new Set(missing)]).toEqual([]);
  });
});
