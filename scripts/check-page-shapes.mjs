/**
 * A census of the shapes pages are actually STORED in.
 *
 * **It exists to give the flat-section shim a deletion condition.**
 * `section-schema.ts` and `section-block-shim.ts` are ~590 lines encoding a
 * second vocabulary for one concept, and they reach into six more files. They
 * cannot go while stored rows still need them — and nobody could say whether
 * that was three rows or three thousand, so "someday" was the only plan. This
 * turns that into a number.
 *
 * **It deliberately does NOT reuse `readEitherShape`.** That function answers
 * what the app can still READ; this answers what is WRITTEN, and a shape we
 * have stopped reading is exactly what a census has to be able to count. Its
 * checks are shallow and structural for the same reason: they must keep working
 * after the parser they are auditing has been deleted.
 *
 * The three shapes, from `CLAUDE.md`'s own account:
 *
 * - `flat` — sections carrying a `type`. Written before `set_actor_sections`
 *   validated blocks. No migration ever converted them.
 * - `columns` — blocks whose containers carry `columns`, written by one save
 *   boundary for about a day. The lenient read path is the only thing that
 *   knows about them.
 * - `blocks` — the current tree, containers carrying `spaces`.
 *
 * It is a REPORT and not a gate: it exits 0 whatever it finds, because a
 * stored shape is not a fault anybody introduced in a pull request. Read it
 * before deciding whether the shim can go.
 *
 * Usage:
 *   node scripts/check-page-shapes.mjs      counts every stored page
 */
import { poolerUrl, PROJECT_NAME } from "./aeleos-project.mjs";

/** The shapes a stored page can be in, in the order a report lists them. */
export const SHAPES = ["flat", "columns", "blocks", "empty", "unknown"];

/**
 * Whether any container anywhere in a tree still carries `columns`.
 *
 * Recursive because the key can be at any depth: a page whose outermost
 * section was re-saved carries `spaces` there and may still hold `columns`
 * three levels down, and that page still needs the lenient read.
 *
 * @param nodes - the blocks to walk.
 * @returns true when one of them, or one of their descendants, carries it.
 */
function holdsColumns(nodes) {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Object.hasOwn(node, "columns")) return true;
    if (Array.isArray(node.children) && holdsColumns(node.children))
      return true;
  }
  return false;
}

/**
 * Which shape one stored `sections` value is in.
 *
 * **The flat and block shapes are disjoint by construction** — a flat section
 * carries `type` and no `kind`, a block carries `kind` and no `type` — so the
 * order these are tested in decides nothing.
 *
 * @param sections - the raw `actor_profiles.sections` value.
 * @returns one of {@link SHAPES}. `unknown` rather than a guess: a value this
 *   does not recognise is a thing to go and look at, not a number to fold into
 *   another shape's total.
 */
export function classifyPage(sections) {
  if (sections === null || sections === undefined) return "empty";
  if (!Array.isArray(sections)) return "unknown";
  if (sections.length === 0) return "empty";

  const first = sections[0];
  if (!first || typeof first !== "object") return "unknown";
  if (Object.hasOwn(first, "type")) return "flat";
  if (!Object.hasOwn(first, "kind")) return "unknown";
  return holdsColumns(sections) ? "columns" : "blocks";
}

/**
 * How many pages are in each shape.
 *
 * @param pages - every stored `sections` value.
 * @returns a count per shape plus the total. Every shape is present even at
 *   zero, so a reader can tell "none left" from "no longer counted".
 */
export function tally(pages) {
  const counts = Object.fromEntries(SHAPES.map((shape) => [shape, 0]));
  for (const page of pages) counts[classifyPage(page)] += 1;
  return { ...counts, total: pages.length };
}

/**
 * Reads every stored page and prints the census.
 *
 * @param password - the project's database password.
 * @returns the process exit code, which is 0 whatever it finds.
 */
export async function run(password) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: poolerUrl(password) });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select sections from public.actor_profiles",
    );
    const counts = tally(rows.map((row) => row.sections));
    console.log(`${PROJECT_NAME} — stored page shapes (${counts.total} pages)`);
    for (const shape of SHAPES) {
      console.log(`  ${shape.padEnd(8)} ${counts[shape]}`);
    }
    if (counts.flat === 0 && counts.columns === 0 && counts.unknown === 0) {
      console.log(
        "\n  Nothing needs the flat-section shim. `section-schema.ts` and",
      );
      console.log(
        "  `section-block-shim.ts` can go — see this script's own header.",
      );
    } else {
      console.log(
        `\n  ${counts.flat + counts.columns} page(s) still need the shim.`,
      );
    }
    return 0;
  } finally {
    await client.end();
  }
}

if (import.meta.filename === process.argv[1]) {
  const password =
    process.env.SUPABASE_DB_PASSWORD ?? process.env.SUPABASE_DB_PASS ?? "";
  if (!password) {
    console.error(
      "no database password. Set SUPABASE_DB_PASSWORD (see .secrets).",
    );
    process.exitCode = 1;
  } else {
    process.exitCode = await run(password);
  }
}
