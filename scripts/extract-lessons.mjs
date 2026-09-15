// scripts/extract-lessons.mjs
/**
 * Splits the pre-move root `CLAUDE.md` at its own headings and writes each
 * part where the instruction-architecture spec says it lives — verbatim.
 *
 * ONE-SHOT. It exists so the move is reproducible and testable rather than
 * done by hand across 3,600 lines; `check-lessons-preserved.mjs` is what
 * proves the result. Retired with that gate once the move is reviewed.
 *
 * Boundaries are exact heading text, so a heading renamed before this runs
 * is a loud failure rather than a silent misfile.
 *
 * Usage:
 *   node scripts/extract-lessons.mjs        # reads ./CLAUDE.md, writes docs/
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const H_OVERVIEW = "## What AeleOS is";
const H_CONVENTIONS = "## Conventions";
const H_HISTORY = "## Current state";
const H_TOOLCHAIN = "## The toolchain, and the rules it cost";
const H_RULES = "### The rules. Each was paid for.";

/**
 * Index of the line equal to `heading`, or a thrown error naming it.
 *
 * @param lines - the file.
 * @param heading - exact heading text.
 * @returns the line index.
 * @throws when the heading is absent, because a misfiled section is worse
 *   than a stopped script.
 */
function at(lines, heading) {
  const i = lines.indexOf(heading);
  if (i === -1) throw new Error(`heading not found: ${heading}`);
  return i;
}

/**
 * The bold lead of a bullet or rule whose opening `**` is on `lines[i]`,
 * read across wrapped lines.
 *
 * @param lines - the file.
 * @param i - the line holding the opening `**`.
 * @returns the text between the first `**` pair, joined with single spaces.
 */
function boldLead(lines, i) {
  let buffer = "";
  for (let j = i; j < Math.min(i + 12, lines.length); j += 1) {
    buffer += (buffer ? " " : "") + lines[j].trim();
    const match = /\*\*(.+?)\*\*/.exec(buffer);
    if (match) return match[1].replace(/\s+/g, " ");
  }
  throw new Error(`unterminated bold lead at line ${i + 1}`);
}

/**
 * Top-level bullets of a section, each with its lead and whole body.
 *
 * @param lines - the section's lines.
 * @returns one entry per line starting `- **`, body running to the next such
 *   line. Text before the first bullet is attached to the first bullet's body
 *   so nothing is dropped.
 */
function bullets(lines) {
  const starts = lines.flatMap((l, i) => (l.startsWith("- **") ? [i] : []));
  return starts.map((start, k) => {
    const end = starts[k + 1] ?? lines.length;
    const from = k === 0 ? 0 : start;
    return {
      lead: boldLead(lines, start),
      body: lines.slice(from, end).join("\n").trimEnd(),
    };
  });
}

/**
 * The numbered rules within `### The rules. Each was paid for.`, and where
 * the last one ends.
 *
 * @param ruleLines - every line after the rules heading.
 * @returns the rules, numbered and bodied, and `afterStart`, the index in
 *   `ruleLines` where the text following the last rule begins.
 */
function readRules(ruleLines) {
  const starts = ruleLines.flatMap((l, i) =>
    /^\d+\. \*\*/.test(l) ? [i] : [],
  );
  const last = starts.at(-1) ?? 0;
  const afterStart = (() => {
    const after = ruleLines.findIndex((l, i) => i > last && /^\*\*/.test(l));
    return after === -1 ? ruleLines.length : after;
  })();
  const rules = starts.map((start, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : afterStart;
    return {
      number: Number(/^(\d+)\./.exec(ruleLines[start])?.[1]),
      lead: boldLead(ruleLines, start),
      body: ruleLines.slice(start, end).join("\n").trimEnd(),
    };
  });
  return { rules, afterStart };
}

/**
 * The root note cut into the parts the spec routes to different homes.
 *
 * @param text - the whole pre-move root `CLAUDE.md`.
 * @returns overview (everything above `## Conventions`, minus the title
 *   line), conventions bullets, history (`## Current state`), the toolchain
 *   intro, numbered rules, and everything after the last rule. Together they
 *   hold every non-heading line of the input.
 * @throws when a boundary heading is missing.
 */
export function splitRoot(text) {
  const lines = text.split("\n");
  at(lines, H_OVERVIEW); // boundary sanity check only; see below
  const c = at(lines, H_CONVENTIONS);
  const h = at(lines, H_HISTORY);
  const t = at(lines, H_TOOLCHAIN);
  const r = at(lines, H_RULES);
  const { rules, afterStart } = readRules(lines.slice(r + 1));
  // The overview keeps the file's own preamble (everything above the first
  // `## `) minus the `# CLAUDE.md` title line, so no line of the input is
  // orphaned; `H_OVERVIEW` above is only asserted to exist as a boundary
  // sanity check.
  const overviewLines = lines
    .slice(0, c)
    .filter((line, i) => !(i === 0 && line.startsWith("# ")));
  return {
    overview: overviewLines.join("\n").trim(),
    conventions: bullets(lines.slice(c + 1, h)),
    history: lines
      .slice(h + 1, t)
      .join("\n")
      .trim(),
    toolchainIntro: lines
      .slice(t + 1, r)
      .join("\n")
      .trim(),
    rules,
    afterRules: lines
      .slice(r + 1)
      .slice(afterStart)
      .join("\n")
      .trim(),
  };
}

/**
 * A kebab-case filename stem for a lead sentence.
 *
 * @param lead - the bold lead.
 * @returns lowercase ASCII words joined by hyphens, at most 60 characters,
 *   with no leading or trailing hyphen.
 */
export function slug(lead) {
  return lead
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Writes every part to its home under `cwd`.
 *
 * @param parts - as {@link splitRoot} cut them.
 * @param cwd - the repository root.
 * @returns the files written, in order.
 */
export function writeParts(parts, cwd) {
  const written = [];
  const put = (rel, body) => {
    const file = path.join(cwd, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${body.trimEnd()}\n`);
    written.push(rel);
  };
  put(
    "docs/overview.md",
    `# AeleOS — the long form\n\nMoved verbatim from the root \`CLAUDE.md\` on 2026-09-15 (see \`docs/superpowers/specs/2026-09-15-instruction-architecture-design.md\`). The root keeps the short form and points here.\n\n${parts.overview}`,
  );
  for (const bullet of parts.conventions) {
    put(
      `docs/lessons/conventions/${slug(bullet.lead)}.md`,
      `# ${bullet.lead}\n\n${bullet.body}`,
    );
  }
  put(
    "docs/HISTORY.md",
    `# AeleOS — the record\n\nThe root \`CLAUDE.md\`'s "Current state" section, moved verbatim on 2026-09-15. Dated, in the order it was written; read it for the account, not for a constraint on new code.\n\n${parts.history}`,
  );
  put(
    "docs/lessons/toolchain.md",
    `# The toolchain, and the rules it cost\n\n${parts.toolchainIntro}\n\nThe numbered rules are one file each under \`docs/lessons/rules/\`.\n\n${parts.afterRules}`,
  );
  for (const rule of parts.rules) {
    put(
      `docs/lessons/rules/${String(rule.number).padStart(2, "0")}-${slug(rule.lead)}.md`,
      `# Rule ${rule.number}: ${rule.lead}\n\n${rule.body}`,
    );
  }
  return written;
}

/** Runs the extraction over the repository. */
function main() {
  const cwd = process.cwd();
  const parts = splitRoot(readFileSync(path.join(cwd, "CLAUDE.md"), "utf8"));
  for (const file of writeParts(parts, cwd)) console.log(file);
}

if (process.argv[1]?.endsWith("extract-lessons.mjs")) main();
