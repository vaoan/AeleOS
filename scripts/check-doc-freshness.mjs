/**
 * Flags exported symbols whose implementation changed while their TSDoc did not.
 *
 * A heuristic by nature. No tool can see that prose went stale: change
 * `getPersonActor` from "returns null when missing" to "throws" without
 * touching the signature and every linter reports green. It is adopted
 * deliberately — see the design, §3 — because AI-driven development churns code
 * faster than comments, and a stale comment is a confident, wrong instruction.
 *
 * Two properties keep it from becoming noise people learn to ignore:
 *
 * - It reports **per symbol**, so the message names `getPersonActor` rather
 *   than a filename.
 * - It **normalises whitespace** before comparing, so Prettier can never
 *   trigger it.
 *
 * There is no suppression flag, by choice: a suppression flag becomes the thing
 * everyone types. The way past it is to touch the doc — restating an invariant
 * that still holds is itself worth writing.
 *
 * Usage:
 *   node scripts/check-doc-freshness.mjs [baseRef]   compare baseRef...HEAD
 *   node scripts/check-doc-freshness.mjs --staged     compare HEAD to the index
 */
import { execFileSync } from "node:child_process";
import ts from "typescript";

/**
 * Collapses runs of whitespace so that reformatting cannot register as a
 * change.
 *
 * @param value - the source or comment text to normalise.
 * @returns the text with all whitespace runs collapsed to single spaces.
 */
const normalise = (value) => value.replace(/\s+/g, " ").trim();

/**
 * The doc comment immediately above a node.
 *
 * @param node - the AST node to look above.
 * @param source - the parsed source file the node belongs to.
 * @returns the block comment text, or an empty string when there is none.
 */
function leadingDoc(node, source) {
  const ranges = ts.getLeadingCommentRanges(source.text, node.pos) ?? [];
  return ranges
    .filter((r) => source.text.slice(r.pos, r.pos + 3) === "/**")
    .map((r) => source.text.slice(r.pos, r.end))
    .join("\n");
}

/**
 * Whether a node carries the `export` keyword.
 *
 * @param node - the AST node to inspect.
 * @returns true when the node is exported.
 */
const isExported = (node) =>
  node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/**
 * The declared name of a top-level node.
 *
 * @param node - the AST node to name.
 * @returns the identifier, or null for nodes that do not declare one.
 */
function nameOf(node) {
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations[0]?.name?.getText?.() ?? null;
  }
  return node.name?.getText?.() ?? null;
}

/**
 * Every exported top-level symbol, paired with its normalised implementation
 * and documentation.
 *
 * @param code - the file's source text.
 * @param fileName - the path, used only for TypeScript's diagnostics.
 * @returns a map of symbol name to its normalised code and doc text.
 */
export function extractSymbols(code, fileName) {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
  );
  const out = new Map();
  source.forEachChild((node) => {
    if (!isExported(node)) return;
    const name = nameOf(node);
    if (!name) return;
    const doc = leadingDoc(node, source);
    const body = node.getText(source);
    out.set(name, { code: normalise(body), doc: normalise(doc) });
  });
  return out;
}

/**
 * Symbols present in both versions whose code moved while their doc stood
 * still.
 *
 * Added and deleted symbols are ignored: `jsdoc/require-jsdoc` already refuses
 * an undocumented export, and reporting them here would name the same problem
 * twice.
 *
 * @param before - symbols extracted from the earlier version.
 * @param after - symbols extracted from the current version.
 * @returns one entry per stale symbol.
 */
export function findStale(before, after) {
  const stale = [];
  for (const [name, now] of after) {
    const then = before.get(name);
    if (!then) continue;
    if (then.code !== now.code && then.doc === now.doc) stale.push({ name });
  }
  return stale;
}

/**
 * Reads a path at a git ref.
 *
 * @param ref - a git ref, or the empty string to read the index.
 * @param file - the repository-relative path.
 * @returns the file's contents, or an empty string when it does not exist
 * there.
 */
function atRef(ref, file) {
  try {
    // stderr is discarded deliberately: a newly added file makes `git show`
    // print "fatal: path … exists on disk, but not in HEAD", which is expected
    // here and is handled by returning "". Letting it through would print a
    // fatal on every commit that adds a file, and a gate that cries wolf gets
    // ignored.
    return execFileSync("git", ["show", `${ref}:${file}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

/**
 * Compares two revisions and reports stale documentation.
 *
 * @returns nothing; exits non-zero when anything is found.
 */
function main() {
  const staged = process.argv.includes("--staged");
  const base = staged
    ? "HEAD"
    : (process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "origin/main");

  const listArgs = staged
    ? ["diff", "--cached", "--name-only"]
    : ["diff", "--name-only", `${base}...HEAD`];

  const changed = execFileSync("git", listArgs, { encoding: "utf8" })
    .split("\n")
    .map((l) => l.trim())
    .filter((f) => /\.tsx?$/.test(f) && !/\.(test|spec)\.tsx?$/.test(f));

  let findings = 0;
  for (const file of changed) {
    // "" as a ref reads the index, which is what a pre-commit run must compare.
    const before = atRef(base, file);
    const after = staged ? atRef("", file) : atRef("HEAD", file);
    if (!before || !after) continue;
    for (const { name } of findStale(
      extractSymbols(before, file),
      extractSymbols(after, file),
    )) {
      findings += 1;
      console.error(
        `${file}: \`${name}\` changed but its TSDoc did not. ` +
          `Update it, or restate the invariant that still holds.`,
      );
    }
  }

  if (findings) {
    console.error(
      `\n${findings} symbol(s) with documentation that may be stale.`,
    );
    process.exit(1);
  }
  console.log(
    `Documentation moved with the code (${changed.length} file(s) checked).`,
  );
}

// Only runs as a CLI, so the tests can import the pure functions.
if (process.argv[1]?.endsWith("check-doc-freshness.mjs")) main();
