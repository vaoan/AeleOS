# Sixteen Pastiches Against Their Captures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the eleven social pastiches and the five era looks against
real captures using the whole style vocabulary, and put each page's own
reference capture on the page.

**Architecture:** The page definitions move out of `scripts/seed-pastiches.mjs`
into an importable module so a test can push every one of them through the
app's real parser — which is the only automated gate this work can have, since
everything else here is data. A second small module owns the reference
registry and builds the inspiration section, and the seeder appends that
section to both sets. No template gains anything.

**Tech Stack:** Node ESM (`.mjs` + hand-written `.d.mts`, matching
`check-source-bytes.mjs`), vitest (`tests/tools` for node, `apps/hub/tests` for
anything needing the app's `@/` alias), Playwright for photographs, `pg` for
seeding.

**Spec:** `docs/superpowers/specs/2026-08-29-pastiches-against-their-captures-design.md`

> **Corrections, 2026-08-29 — this plan was executed and six of its
> instructions were wrong.** Each was found by running it, not by arguing with
> it, and the body below is left as delivered rather than rewritten.
>
> - **`corners` was prescribed alongside `radius: "square"`**, in the Task 5
>   and Task 8 briefs. A complete no-op: `radius: "square"` already sets
>   `--skin-round: 0`, and `squareOffCorners` writes every named corner as a
>   multiple of that same token, so a "rounded" corner and a square one
>   compute to the identical `0`. `corners` needs `radius: "soft"` or
>   `"round"` to mean anything, and is absent on every page this plan left at
>   `"square"`.
> - **`heading_gap: "none"` was suggested on sections already carrying a bar
>   heading**, across several tasks' briefs. Also a no-op — `blocks.tsx`
>   resolves an absent `heading_gap` to `gap-0` on a barred heading with no key
>   set at all. It produced **13 dead keys** across four tasks before being
>   caught; all were removed rather than left reading as a change in the diff.
> - **`heading_pad: "roomy"` was prescribed for Vista and Windows 7** (Task
>   10's brief). Both captures show visibly translucent Aero glass and keep
>   plain headings on purpose — a `bar` fill would paint over the one thing
>   `aero` is — and `heading_pad` is read only where a bar is drawn. Neither
>   look carries it.
> - **Task 3's brief contradicts itself.** Its test asserts exactly three
>   pages carry no capture (`board`, `sky`, `threads`), while its own prose two
>   paragraphs above puts `geocities` through the identical `absent` branch
>   for an unrelated reason — GeoCities was millions of personal pages, never
>   one capture. Both are true and the test's list is the incomplete one:
>   `absent` covers four pages, not three.
> - **Task 7's brief opens on a false premise: "Both replay without their
>   stylesheets"**, of Facebook and Fotolog together. A fresh fetch of
>   Facebook's arquivo.pt reference capture (run as part of the same task)
>   turned out fully styled — flat, sharp-cornered boxes in the period's own
>   navy and green, no raw bullet list anywhere. Only Fotolog replays
>   unstyled.
> - **A ruling dispatched alongside Task 10 claimed "`heading_corners` is unset
>   on all five looks."** `era-winxp` already carried it —
>   `corners`/`heading_corners` express Luna's window shape from a prior
>   commit on this same branch, so the premise was stale before the task began.
>   Confirmed rather than re-added.

## Global Constraints

Every task's requirements implicitly include these. Values are copied verbatim
from the spec and `CLAUDE.md`.

- **Nothing is stored.** Every picture, capture and avatar is a hot link.
  AeleOS hosts no files.
- **No new skin, no new mode, no new leaf kind.** If a page cannot be reached
  with the current vocabulary, that is a finding for the findings document —
  the same bar that removed `columns`.
- **Colour stays page-level.** Per-block colour is refused by design; this work
  does not reopen it.
- **Nothing decorative may enter `ERA_LOOKS`.** It is spread into `TEMPLATES`
  in `fursona-templates.ts`, so anything added there lands on the page of every
  author who picks that look. The inspiration section is appended by
  `scripts/seed-pastiches.mjs`.
- **Every page carries either a capture or a stated reason there can be none.**
  Never a substitute capture presented as the reference.
- **The seeder owns everything the pages depend on** — visibility, avatar, and
  now the inspiration section. A seed that does not restore everything it
  depends on works exactly once.
- **Where fidelity loses to purpose, the reason is written in that page's own
  comment.** The Messenger precedent: the panels went to the measurement and
  the blue field deliberately did not, because `aero` is why the page exists.
- **Measure, do not eyeball.** A colour written into a theme is sampled from a
  capture, and the sample is recorded in the comment beside it.
- **Seed from `main` after rebase, never from a feature branch.** Re-seeding
  from a branch cut before an avatar change has silently wiped avatars here
  before.
- **Do not open a pull request without being asked.** Commit per task on the
  branch.
- The branch is `pastiches-against-captures`, already cut from `origin/main`.

### The capture URL, once

Every archive-backed reference is this shape, and no task builds it by hand:

```
https://arquivo.pt/screenshot?url=<encodeURIComponent(
  "https://arquivo.pt/noFrame/replay/" + timestamp + "/" + originalUrl
)>
```

`noFrame/replay` rather than `wayback` is what omits the archive's own banner
and sidebar. Longest measured across the six archive-backed pages is **140**
characters, against a 500-character cap on `image_url`.

---

## File Structure

| File                                                     | Responsibility                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `scripts/pastiche-pages.mjs`                             | **Create.** The sixteen pages' blocks and themes, and the page registry. |
| `scripts/pastiche-pages.d.mts`                           | **Create.** Types for the above, so TS tests can import it.              |
| `scripts/pastiche-references.mjs`                        | **Create.** The reference registry and the inspiration-section builder.  |
| `scripts/pastiche-references.d.mts`                      | **Create.** Types for the above.                                         |
| `tests/tools/pastiche-references.test.ts`                | **Create.** Unit tests for the builder — node env, no alias needed.      |
| `apps/hub/tests/pastiche-pages.test.ts`                  | **Create.** Every page through the app's real parser and block schema.   |
| `scripts/seed-pastiches.mjs`                             | **Modify.** Becomes the writer: imports pages, appends sections, seeds.  |
| `README.md`                                              | **Modify.** The two showcase tables, re-derived from the file.           |
| `docs/superpowers/specs/2026-08-27-pastiche-findings.md` | **Modify.** The corrections this work establishes.                       |

`scripts/pastiche-pages.mjs` exists because **`seed-pastiches.mjs` cannot be
imported**: it reads `SUPABASE_DB_PASSWORD` and calls `process.exit(1)` at
module top level (line 108–111) and `await client.connect()` at line 1361. So
today nothing can check a page without writing to the production database.
That is what Task 1 fixes and what every later task's gate depends on.

---

### Task 1: Make the pages importable

A pure move. Nothing about any page changes; the guard is that the seeded
payload is byte-identical before and after.

**Files:**

- Create: `scripts/pastiche-pages.mjs`
- Create: `scripts/pastiche-pages.d.mts`
- Modify: `scripts/seed-pastiches.mjs`

**Interfaces:**

- Produces: `export const PAGES` — an array of
  `{ handle, displayName, blocks, theme, avatar }` objects, replacing the
  positional tuples the seeder uses today. Named fields because Task 4 adds a
  sixth thing to each page and a six-wide tuple is unreadable.
- Produces: `export const ERA_LOOKS_META` — moved unchanged.
- Consumes: nothing.

- [ ] **Step 1: Capture the current payload as a baseline**

The seeder cannot be imported, so extract the payload the way the seeder builds
it — by running the file with its database call stubbed. Write this to the
scratchpad, not the repository:

```bash
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync("scripts/seed-pastiches.mjs", "utf8");
// Cut the file at the line that connects, keeping every definition above it.
const body = src.slice(0, src.indexOf("await client.connect()"));
// Neutralise the two top-level side effects so the definitions can be loaded.
const safe = body
  .replace(/const password = process\.env\.SUPABASE_DB_PASSWORD;/, "const password = \"x\";")
  .replace(/import pg from \"pg\";/, "const pg = { Client: class {} };")
  .replace(/import \{ poolerUrl, PROJECT_NAME \} from \"\.\/aeleos-project\.mjs\";/, "const poolerUrl = () => \"\"; const PROJECT_NAME = \"\";");
writeFileSync("baseline-src.mjs", safe + "\nexport { PAGES };\n");
'
node --input-type=module -e '
import { PAGES } from "./baseline-src.mjs";
import { writeFileSync } from "node:fs";
writeFileSync(
  process.env.TMPDIR + "/pastiche-baseline.json",
  JSON.stringify(PAGES, null, 2) + "\n",
);
console.log("baseline written:", PAGES.length, "pages");
'
rm baseline-src.mjs
```

Expected: `baseline written: 11 pages`.

- [ ] **Step 2: Move the definitions**

Cut everything from the `leaf` / `group` / `section` / `gradient` / `theme`
helpers down to and including the `PAGES` array out of `seed-pastiches.mjs`
and into `scripts/pastiche-pages.mjs`, together with `ERA_LOOKS`,
`ERA_LOOKS_META`, `photo` and `tile`. Keep every comment with the page it
documents — those comments carry the measurements and are the most valuable
thing in the file.

Change the tuples to named fields. The array today is
`[handle, displayName, blocks, theme, avatar]`; it becomes:

```js
export const PAGES = [
  {
    handle: "myspace",
    displayName: "Aeleos",
    blocks: myspace,
    theme: myspaceTheme,
    avatar: "https://cdn.simpleicons.org/myspace/003399",
  },
  // …the other ten, in the same order
];
```

Use each page's existing avatar URL verbatim — do not retype them, copy them.

- [ ] **Step 3: Point the seeder at the module**

Replace the deleted block in `seed-pastiches.mjs` with:

```js
import { PAGES, ERA_LOOKS, ERA_LOOKS_META } from "./pastiche-pages.mjs";
```

and change the two loops to destructure named fields:

```js
for (const { handle, displayName, blocks, theme: pageTheme, avatar } of PAGES) {
```

- [ ] **Step 4: Prove the payload did not move**

```bash
node --input-type=module -e '
import { PAGES } from "./scripts/pastiche-pages.mjs";
import { readFileSync } from "node:fs";
const before = readFileSync(process.env.TMPDIR + "/pastiche-baseline.json", "utf8");
const after = JSON.stringify(
  PAGES.map((p) => [p.handle, p.displayName, p.blocks, p.theme, p.avatar]),
  null,
  2,
) + "\n";
if (before !== after) {
  console.error("PAYLOAD MOVED — the refactor was not pure");
  process.exit(1);
}
console.log("identical:", PAGES.length, "pages");
'
```

Expected: `identical: 11 pages`. If it fails, the move dropped or reordered
something — fix the module, do not adjust the baseline.

- [ ] **Step 5: Write the type declarations**

`scripts/pastiche-pages.d.mts`, following `check-source-bytes.d.mts`'s shape —
a header saying why the implementation is `.mjs`, then declarations. The block
and theme shapes are structural here rather than imported from the app,
because `scripts/` may not depend on `apps/hub`:

```ts
/** One seeded page: what it is called, what it holds, and how it looks. */
export interface PastichePage {
  /** The handle it is served at, under `/137/`. */
  handle: string;
  /** The display name the actor row carries. */
  displayName: string;
  /** The page's block tree, as `actor_profiles.sections` stores it. */
  blocks: unknown[];
  /** The page's theme, as `actor_profiles.theme` stores it. */
  theme: Record<string, unknown>;
  /** A hot-linked mark, never committed. */
  avatar: string;
}

/** The eleven social pastiches, in the order they are seeded. */
export declare const PAGES: PastichePage[];
```

Declare `ERA_LOOKS` and `ERA_LOOKS_META` in the same file.

- [ ] **Step 6: Run the gates**

```bash
pnpm check:tools
```

Expected: PASS. `knip` may report the new module as unused until Task 2
imports it from a test — it runs `--no-exit-code`, so this does not fail, but
note the line so Task 2 can confirm it clears.

- [ ] **Step 7: Commit**

```bash
git add scripts/pastiche-pages.mjs scripts/pastiche-pages.d.mts scripts/seed-pastiches.mjs
git commit -m "refactor(pastiches): the pages become importable, so they can be checked

seed-pastiches.mjs reads a password and connects at module top level, so
nothing could look at a page without writing to production. The definitions
move to scripts/pastiche-pages.mjs unchanged — proved byte-identical against a
payload dumped before the move — and the seeder becomes the writer alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Gate every page on the app's real parser

The one automated check this work can have. It is the same shape as the era
looks' own guard: **every shipped page is pushed through the real parser, so a
page the parser refuses fails the build rather than somebody's editor.**

**Files:**

- Create: `apps/hub/tests/pastiche-pages.test.ts`

**Interfaces:**

- Consumes: `PAGES` and `ERA_LOOKS` from `scripts/pastiche-pages.mjs` (Task 1).
- Produces: nothing later tasks import. It is a gate.

It lives in `apps/hub/tests/` rather than `tests/tools/` because it needs the
app's `@/` alias to reach `parseTheme` and the block schema, and
`vitest.config.tools.ts` configures no alias. `era-looks-json.test.ts` already
reaches into `scripts/` from here, so the direction is established. It adds no
coverage burden: `apps/hub/vitest.config.ts:20` scopes coverage to
`src/features/**`, `src/shared/**` and `e2e-target.ts`.

**This gate carries more weight than it looks like it should, because the
seeder bypasses the database's own validation.** `set_actor_sections` is what
enforces the depth cap, the style-bag allowlist and the required kinds — and
the seeder does not call it. It writes `actor_profiles` with direct SQL, so a
page it seeds has never been checked by anything. Until this test exists, the
only validation any of the sixteen pages has ever had is that a human looked at
them.

`pageSchema` enforces the block count and byte caps and **not** the required
kinds, which is why the third case below checks those separately rather than
assuming the schema covers them.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it } from "vitest";

import { PAGES, ERA_LOOKS } from "../../../scripts/pastiche-pages.mjs";
import { parseTheme } from "@/features/actors/domain/actor-theme";
import { blocksSchema } from "@/features/actors/domain/block-schema";
import { REQUIRED_KINDS } from "@/features/actors/domain/required-blocks";

/** Every seeded page, social and era look alike, with a name to report by. */
const everyPage = [
  ...PAGES.map((p) => [p.handle, p.blocks, p.theme] as const),
  ...ERA_LOOKS.map((l) => [l.id, l.blocks, l.theme] as const),
];

describe("every seeded page", () => {
  it("covers both sets", () => {
    // A vacuous suite is the failure mode here: if the import ever answers an
    // empty array every case below passes for free.
    expect(everyPage.length).toBe(16);
  });

  it.each(everyPage)(
    "%s keeps every theme value it sets",
    (id, _blocks, theme) => {
      // parseTheme is the READ path — it normalises, drops and clamps. Asserting
      // idempotence would be true and useless: what matters is that no value the
      // seeder sets is silently DISCARDED at read, which is the exact shape of
      // the shipped `measure` bug — a vocabulary written down in TypeScript that
      // the read path had never heard of.
      const parsed = parseTheme(theme) as Record<string, unknown>;
      for (const [key, value] of Object.entries(theme)) {
        if (value === null) continue; // null means "the design's own", not a value.
        expect(parsed[key], `${id} lost its ${key}`).toEqual(value);
      }
    },
  );

  it.each(everyPage)("%s is a tree the schema accepts", (_id, blocks) => {
    expect(() => blocksSchema.parse(blocks)).not.toThrow();
  });

  it.each(everyPage)("%s carries every required kind", (id, blocks) => {
    const kinds = new Set<string>();
    const walk = (b: unknown): void => {
      const node = b as { kind?: string; children?: unknown[] };
      if (node.kind) kinds.add(node.kind);
      node.children?.forEach(walk);
    };
    (blocks as unknown[]).forEach(walk);
    // Every one of these is a fursona page, so `owner` is required and
    // `fursonas` is refused.
    for (const required of REQUIRED_KINDS.fursona) {
      expect(kinds, `${id} is missing a ${required} block`).toContain(required);
    }
  });
});
```

Check the real export names before running — `blocksSchema` and
`REQUIRED_KINDS.fursona` are the expected names, but read
`block-schema.ts` and `required-blocks.ts` and use whatever they actually
export. A test that imports a name that does not exist fails for the wrong
reason.

- [ ] **Step 2: Run it**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS, 16 pages × 3 cases plus the count case. If a page fails now,
that is a real pre-existing defect — report it rather than loosening the
assertion.

- [ ] **Step 3: Sabotage-verify each assertion separately**

This guards behaviour that is already correct, so it proves nothing until it
has been red. Three separate breaks, because an assertion that cannot fail
first is corroborating rather than independent:

```bash
# 1. theme — an unknown skin value
node -e "console.log('edit scripts/pastiche-pages.mjs: myspaceTheme.skin = \"notaskin\"')"
# expect: the "parses its theme unchanged" case reddens for `myspace`

# 2. tree — a leaf with no kind
node -e "console.log('edit: add { title_en: \"x\" } to the myspace blocks')"
# expect: the "is a tree the schema accepts" case reddens for `myspace`

# 3. required — delete the owner leaf from one page
node -e "console.log('edit: remove leaf(\"owner\", \"Owner\") from threads')"
# expect: the "carries every required kind" case reddens for `threads`
```

Restore by **copying the file back**, never `git checkout --` — that restores
to the last commit and would discard the work in progress. Copy
`scripts/pastiche-pages.mjs` aside before each break and copy it back after,
and put the restore in a shell `trap` so a crash cannot leave the tree
sabotaged.

Confirm each break actually landed before believing the run: a sabotage that
fails to apply looks exactly like a successful verification.

- [ ] **Step 4: Commit**

```bash
git add apps/hub/tests/pastiche-pages.test.ts
git commit -m "test(pastiches): every seeded page through the app's real parser

Sixteen pages had no gate at all — the only way to find out whether one was
valid was to seed it against production. Each now goes through parseTheme, the
block schema and the required-kind rule, sabotage-verified three ways.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The reference registry and the inspiration section

**Files:**

- Create: `scripts/pastiche-references.mjs`
- Create: `scripts/pastiche-references.d.mts`
- Create: `tests/tools/pastiche-references.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `captureUrl(timestamp: string, originalUrl: string): string`
  - `REFERENCES: Record<string, Reference>` keyed by page handle
  - `inspirationSection(reference: Reference): object` — a depth-0 container
    block, ready to append to a page's `blocks`

- [ ] **Step 1: Write the failing tests**

`tests/tools/pastiche-references.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  captureUrl,
  inspirationSection,
  REFERENCES,
} from "../../scripts/pastiche-references.mjs";

describe("captureUrl", () => {
  it("wraps a noFrame replay, not a framed one", () => {
    const url = captureUrl("20080215082853", "http://www.hi5.com/");
    // Asserting on the DECODED parameter rather than on percent-escapes: the
    // claim is about which replay is being asked for, not about how a slash is
    // spelled, and an assertion on the escaping would pass a URL that encoded
    // the right string into the wrong parameter.
    const target = new URL(url).searchParams.get("url");
    // The framed replay carries the archive's own banner and sidebar, which
    // would be 40% of the reference picture.
    expect(target).toContain("/noFrame/replay/");
    expect(target).not.toContain("/wayback/");
  });

  it("carries the whole replay URL as one parameter", () => {
    const url = captureUrl("20080215082853", "http://www.hi5.com/");
    // The replay URL contains its own `://` and slashes. Left unencoded it
    // would be truncated or split; round-tripping it through searchParams is
    // what proves it survived as one opaque value.
    expect(new URL(url).searchParams.get("url")).toBe(
      "https://arquivo.pt/noFrame/replay/20080215082853/http://www.hi5.com/",
    );
    expect(new URL(url).origin).toBe("https://arquivo.pt");
  });

  it("stays inside the 500-character image_url cap", () => {
    // The longest real one is `myspace`, whose target carries a username.
    const url = captureUrl(
      "20081024054301",
      "http://profile.myspace.com/akioyang",
    );
    expect(url.length).toBe(140);
    expect(url.length).toBeLessThan(500);
  });
});

describe("REFERENCES", () => {
  it("names all sixteen pages", () => {
    expect(Object.keys(REFERENCES)).toHaveLength(16);
  });

  it("gives every entry either a capture or a reason there is none", () => {
    for (const [handle, ref] of Object.entries(REFERENCES)) {
      const hasCapture = typeof ref.image === "string" && ref.image.length > 0;
      const hasReason = typeof ref.absent === "string" && ref.absent.length > 0;
      // Exactly one. A page with both is undecided; a page with neither is a
      // gap wearing the clothes of a finding.
      expect(hasCapture !== hasReason, `${handle} must have exactly one`).toBe(
        true,
      );
    }
  });

  it("marks exactly the three subjects no archive can hold", () => {
    const absent = Object.entries(REFERENCES)
      .filter(([, r]) => r.absent)
      .map(([h]) => h)
      .sort();
    expect(absent).toEqual(["board", "sky", "threads"]);
  });
});

describe("inspirationSection", () => {
  it("draws a picture and a link when there is a capture", () => {
    const section = inspirationSection(REFERENCES.hi5);
    const kinds = section.children.map((c) => c.kind);
    expect(kinds).toContain("picture");
    expect(kinds).toContain("link");
  });

  it("draws no picture when there is none, and says why instead", () => {
    const section = inspirationSection(REFERENCES.board);
    const kinds = section.children.map((c) => c.kind);
    // The discriminating half: a section that merely omitted the picture would
    // pass a `not.toContain` on its own. It has to carry the reason too.
    expect(kinds).not.toContain("picture");
    expect(kinds).toContain("text");
    const reason = section.children.find((c) => c.kind === "text");
    expect(reason.description_en).toBe(REFERENCES.board.absent);
  });

  it("is bilingual, because a section name is the author's own writing", () => {
    const section = inspirationSection(REFERENCES.hi5);
    expect(section.name_en).toBe("The inspiration");
    expect(section.name_es).toBe("La inspiración");
  });

  it("sits at depth 0 as a named container", () => {
    const section = inspirationSection(REFERENCES.hi5);
    expect(section.kind).toBe("container");
    expect(typeof section.name_en).toBe("string");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test:tools
```

Expected: FAIL — `Cannot find module '../../scripts/pastiche-references.mjs'`.

- [ ] **Step 3: Write the module**

`scripts/pastiche-references.mjs`. The registry's sixteen entries use exactly
these values, each verified on 2026-08-29:

| handle        | timestamp        | original URL                          |
| ------------- | ---------------- | ------------------------------------- |
| `myspace`     | `20081024054301` | `http://profile.myspace.com/akioyang` |
| `hi5`         | `20080215082853` | `http://www.hi5.com/`                 |
| `sonico`      | `20081024155043` | `http://www.sonico.com/`              |
| `fotolog`     | `20080215112915` | `http://www.fotolog.com/`             |
| `facebook`    | `20080215125110` | `http://www.facebook.com/`            |
| `furaffinity` | `20191214070143` | `http://www.furaffinity.net/`         |

The five era looks and Messenger use a Wikipedia file directly rather than
`captureUrl`, because a curated screenshot on a permanent CDN beats a rendered
replay and because none of these six is a web page at all:

| handle      | image URL                                                                              |
| ----------- | -------------------------------------------------------------------------------------- |
| `messenger` | `https://upload.wikimedia.org/wikipedia/en/9/9b/Windows-Live-Messenger-80-236x300.png` |
| `era-win98` | `https://upload.wikimedia.org/wikipedia/en/0/00/Windows98.png`                         |
| `era-winxp` | `https://upload.wikimedia.org/wikipedia/en/6/64/Windows_XP_Luna.png`                   |
| `era-vista` | `https://upload.wikimedia.org/wikipedia/en/a/a3/Windows_Vista.png`                     |
| `era-win7`  | `https://upload.wikimedia.org/wikipedia/en/5/50/Windows_7_SP1_screenshot.png`          |
| `era-win8`  | `https://upload.wikimedia.org/wikipedia/en/8/8e/Windows_8_Start_Screen.png`            |

`geocities` uses `https://geocities.restorativland.org/Area51/` as its `link`
and has no single image — it is a gallery of many pages rather than one
capture — so it takes the `absent` branch with the reason
`"GeoCities was millions of personal pages, not one. The reference is a restored gallery of real archived ones rather than a single capture."`

The three genuine absences:

```js
board: {
  absent:
    "No archive holds this. A crawler arrives logged out and is served the light page, so the dark mode this imitates was never captured anywhere — a property of what an archive can see, not a gap in its coverage.",
  link: "https://arquivo.pt/wayback/20080218174727/http://twitter.com/",
},
sky: {
  absent:
    "The archive has years of captures and none of a profile: a crawler is served the logged-out splash. This page's colours were read off the live site instead, on 2026-08-29.",
  link: "https://bsky.app/",
},
threads: {
  absent:
    "The archive's captures replay blank. Threads builds its page after the markup a crawler stores, so there is nothing to replay. This page's colours were read off the live site in dark mode instead, on 2026-08-29.",
  link: "https://www.threads.net/",
},
```

The builder:

```js
/**
 * The section that shows what a page is imitating.
 *
 * @param reference - one entry from {@link REFERENCES}.
 * @returns a depth-0 named container, ready to append to a page's blocks.
 */
export function inspirationSection(reference) {
  const children = [];
  if (reference.image) {
    children.push({
      kind: "picture",
      title_en: reference.title_en,
      title_es: reference.title_es,
      description_en: "",
      image_url: reference.image,
      // The captures are whole pages rather than crops, so cropping them to a
      // card would hide the arrangement that is the entire point.
      style: { image_fit: "contain" },
    });
  }
  if (reference.absent) {
    children.push({
      kind: "text",
      title_en: "No capture exists",
      title_es: "No existe una captura",
      description_en: reference.absent,
      description_es: reference.absent_es,
    });
  }
  children.push({
    kind: "link",
    title_en: reference.link_label_en,
    title_es: reference.link_label_es,
    description_en: "",
    link_url: reference.link,
  });
  return {
    kind: "container",
    mode: "stack",
    name_en: "The inspiration",
    name_es: "La inspiración",
    children,
    // Bare and plain, so the section reads as an appendix rather than as part
    // of the imitation above it.
    style: { chrome: "bare", heading: "plain" },
  };
}
```

Every entry carries `title_en`/`title_es`, `link_label_en`/`link_label_es` and,
where `absent` is set, `absent_es`. **These are the author's own writing, not
next-intl** — a person's own words are never catalogue keys, and a missing
Spanish string here is a page that has not been written rather than a build
failure. Write both languages for all sixteen.

- [ ] **Step 4: Run to verify it passes**

```bash
pnpm test:tools
```

Expected: PASS.

- [ ] **Step 5: Write `scripts/pastiche-references.d.mts`**

Declare `Reference`, `REFERENCES`, `captureUrl` and `inspirationSection`, with
TSDoc stating the contract rather than the types — `captureUrl` returns a URL
that is a hot link and never a stored file; `inspirationSection` returns a
container whose children depend on which branch the reference took.

- [ ] **Step 6: Confirm every capture URL actually resolves**

The registry is a set of claims about six timestamps. Check them rather than
trust them:

```bash
node --input-type=module -e '
import { REFERENCES } from "./scripts/pastiche-references.mjs";
for (const [handle, ref] of Object.entries(REFERENCES)) {
  const url = ref.image ?? ref.link;
  const res = await fetch(url, { method: "GET" }).catch((e) => ({ status: String(e) }));
  console.log(String(res.status).padEnd(6), handle.padEnd(12), url.slice(0, 70));
}
'
```

Expected: every row `200`. A non-200 means a timestamp is wrong — find a real
one with the CDX API rather than adjusting the test:

```bash
curl -s "https://arquivo.pt/wayback/cdx?url=<host>&limit=400&fl=timestamp,status,mime,url&output=json"
```

Note that the arquivo screenshot endpoint renders on demand and a cold request
can take 60–150 seconds. A timeout is not a failure; retry once before
concluding a URL is bad.

- [ ] **Step 7: Commit**

```bash
git add scripts/pastiche-references.mjs scripts/pastiche-references.d.mts tests/tools/pastiche-references.test.ts
git commit -m "feat(pastiches): a page can show what it is imitating

arquivo.pt/screenshot pointed at a noFrame replay returns a chrome-free PNG of
an archived page, so a reference is a hot link and nothing is stored. Sixteen
entries, each carrying either a capture or a stated reason there can be none —
the board, Bluesky and Threads being the three no archive can hold.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Append the section to all sixteen pages

**Files:**

- Modify: `scripts/seed-pastiches.mjs`
- Modify: `apps/hub/tests/pastiche-pages.test.ts`

**Interfaces:**

- Consumes: `REFERENCES` and `inspirationSection` from Task 3; `PAGES` and
  `ERA_LOOKS` from Task 1.
- Produces: nothing.

- [ ] **Step 1: Extend the parser gate first**

Add to `apps/hub/tests/pastiche-pages.test.ts`:

```ts
import {
  REFERENCES,
  inspirationSection,
} from "../../../scripts/pastiche-references.mjs";

describe("the inspiration section", () => {
  it.each(Object.keys(REFERENCES))(
    "%s appends a tree the schema accepts",
    (handle) => {
      // The section is appended at seed time, so this is where it is checked —
      // the page module never holds it.
      expect(() =>
        blocksSchema.parse([inspirationSection(REFERENCES[handle])]),
      ).not.toThrow();
    },
  );

  it("names a reference for every seeded page and no others", () => {
    const seeded = [
      ...PAGES.map((p) => p.handle),
      ...ERA_LOOKS.map((l) => l.id),
    ];
    expect(Object.keys(REFERENCES).sort()).toEqual(seeded.sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: FAIL on "names a reference for every seeded page" only if a handle is
missing or misspelled. If it passes immediately, the registry already matches —
confirm by deliberately renaming one key, watching it redden, and restoring.

- [ ] **Step 3: Append in both seeder loops**

```js
import { REFERENCES, inspirationSection } from "./pastiche-references.mjs";
```

and in each loop, before the insert:

```js
// The section is appended HERE rather than stored in the page module, and for
// the era looks that is load-bearing rather than tidy: ERA_LOOKS is spread
// into TEMPLATES, so anything put there would land on the page of every author
// who picks that look.
const withReference = [...blocks, inspirationSection(REFERENCES[handle])];
```

Pass `withReference` to the `actor_profiles` insert in place of `blocks`.

- [ ] **Step 4: Run every gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts && pnpm check:tools
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-pastiches.mjs apps/hub/tests/pastiche-pages.test.ts
git commit -m "feat(pastiches): every seeded page carries its own reference

Appended by the seeder, never stored in the page module — ERA_LOOKS is spread
into TEMPLATES, so a section added there would land on the page of every author
who picks that look.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## The method every page task follows

Tasks 5 to 10 restyle pages. They are **data**, so they have no unit test of
their own beyond Task 2's parser gate; the evidence is a measurement and a
photograph. Each task does the same four things with different arguments.

**Fetching a capture.** Write this to the scratchpad — it is not committed,
because the values it produces are what gets committed, in the comment beside
each theme:

```bash
cat > "$TMPDIR/shot.mjs" <<'EOF'
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire("file:///Z:/Github/aeleos/apps/hub/package.json");
const { chromium } = require("@playwright/test");
const [, , src, out, top = "0", height = "1400"] = process.argv;
const data = "data:image/png;base64," + readFileSync(src).toString("base64");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1100, height: Number(height) } });
await p.setContent(
  "<style>html,body{margin:0;background:#fff}img{display:block;width:1100px}</style>" +
    "<img src='" + data + "'>",
);
await p.waitForFunction(() => {
  const i = document.querySelector("img");
  return i && i.complete && i.naturalWidth > 0;
});
await p.evaluate((y) => window.scrollTo(0, y), Number(top));
await p.screenshot({ path: out });
await b.close();
EOF
```

Download a capture with `curl` against the URL `captureUrl` builds, then run
that script to page through a tall one.

**Sampling a colour.** Never eyeball a hex. This reports the ten colours
covering the most area, which is what a palette actually is:

```bash
cat > "$TMPDIR/sample.mjs" <<'EOF'
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire("file:///Z:/Github/aeleos/apps/hub/package.json");
const { chromium } = require("@playwright/test");
const [, , src] = process.argv;
const data = "data:image/png;base64," + readFileSync(src).toString("base64");
const b = await chromium.launch();
const p = await b.newPage();
const top = await p.evaluate(async (d) => {
  const img = new Image();
  img.src = d;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const { data: px } = x.getImageData(0, 0, c.width, c.height);
  const seen = new Map();
  for (let i = 0; i < px.length; i += 4) {
    const hex =
      "#" +
      [px[i], px[i + 1], px[i + 2]]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
    seen.set(hex, (seen.get(hex) ?? 0) + 1);
  }
  const total = px.length / 4;
  return [...seen]
    .sort((a, z) => z[1] - a[1])
    .slice(0, 10)
    .map(([hex, n]) => `${hex}  ${((n / total) * 100).toFixed(1)}%`);
}, data);
console.log(top.join("\n"));
await b.close();
EOF
```

**Applying the change.** Edit the page's entry in
`scripts/pastiche-pages.mjs`. Record every sampled value in the comment beside
the theme, in the style the file already uses — the measurement, then what
moved, then why. Where fidelity loses to purpose, say which won and why, in
that comment.

**Photographing it.** After the whole task's pages are edited:

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

then seed and photograph per Task 12. Do not seed after every page — seeding
writes to production.

---

### Task 5: MySpace, as a page somebody made rather than a page they were given

The largest change in the plan, and the one the spec's "aim at the era, not the
product" ruling exists for.

**Files:**

- Modify: `scripts/pastiche-pages.mjs` — `myspace` and `myspaceTheme`

- [ ] **Step 1: Fetch and read the capture**

```bash
curl -s --max-time 180 -o "$TMPDIR/myspace.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20081024054301/http://profile.myspace.com/akioyang"))')"
node "$TMPDIR/shot.mjs" "$TMPDIR/myspace.png" "$TMPDIR/myspace-top.png" 0 1500
node "$TMPDIR/sample.mjs" "$TMPDIR/myspace.png"
```

Read `myspace-top.png`. It is a real customised profile from October 2008.

- [ ] **Step 2: Apply what the capture shows**

The current page is MySpace's **default** chrome — a pale gradient, a stardust
tile, white boxes. The capture is what an owner did to it, and four things
differ:

- **A photograph behind the whole page**, not a texture tile. Set
  `backgroundUrl` to a `photo()` seed at a large size and `backgroundFit` to
  `"cover"`. Keep it a `picsum` link like every other picture here.
- **Boxes that let the photograph through.** This is the one that may not be
  reachable: a block's fill is derived, and there is no opacity key. Try
  `surface` set to a dark value close to the photograph's own dominant colour,
  which is what the capture's boxes read as. **If it cannot be reached, that is
  a finding** — write it into the findings document as a numbered gap rather
  than approximating and calling it done.
- **Thin bright borders**, which `border: "solid"` plus `radius: "square"` on
  each section now expresses and did not when this page was written.
- **The title bars are square and welded to their content**, which is
  `corners: "tl,tr"` on the section with `heading_gap: "none"` — neither used
  anywhere in this file today.

Keep `font: "classic"`, `spacing: "compact"` and `measure: "wide"`: the capture
confirms all three.

- [ ] **Step 3: Record the measurement in the comment**

Replace the existing comment's claim that the page is white boxes with solid
bars. It describes the default profile and this page is no longer that. State
the capture's date and URL, the sampled colours, and the reasoning for the
change.

- [ ] **Step 4: Run the gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pastiche-pages.mjs
git commit -m "feat(pastiches): MySpace is a page somebody made, not one they were given

Rebuilt against a real customised profile — profile.myspace.com/akioyang,
October 2008 — rather than the site's default chrome. A portal capture is not
a page capture, and this pastiche had been built from the wrong subject.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: hi5 and Sonico, the 2008 box-and-bar pages

**Files:**

- Modify: `scripts/pastiche-pages.mjs` — `hi5`, `hi5Theme`, `sonico`,
  `sonicoTheme`

- [ ] **Step 1: Fetch and sample both**

```bash
curl -s --max-time 180 -o "$TMPDIR/hi5.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20080215082853/http://www.hi5.com/"))')"
curl -s --max-time 180 -o "$TMPDIR/sonico.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20081024155043/http://www.sonico.com/"))')"
node "$TMPDIR/sample.mjs" "$TMPDIR/hi5.png"
node "$TMPDIR/sample.mjs" "$TMPDIR/sonico.png"
```

- [ ] **Step 2: Apply the window chrome both pages are missing**

Both are white pages with panels under solid title bars — the idiom `corners`,
`heading_corners` and `heading_gap` exist for, and neither page uses any of
them. For each section on both pages:

- `heading: "bar"` rather than `"gradient"` where the capture's bars are flat.
  hi5's are a soft vertical ramp; Sonico's `#003399` bar is flat. Decide per
  page from the capture, not from the other page.
- `corners: "tl,tr"` with `radius: "soft"`, so a bar rounds across its top and
  the body squares off at its foot — the window shape.
- `heading_gap: "none"`, welding the bar to its content, which is what every
  panel in both captures does.
- `heading_pad: "snug"`, since `spacing: "compact"` already shrinks the type.

Sonico's `accent` `#003399` and `surface` `#f3f3f3` are already measured and
correct — confirm against the fresh sample and leave them if they hold.

- [ ] **Step 3: Correct hi5's own theme comment**

It says a 2007 capture "is blue and grey title bars over white". The capture
fetched here is February 2008, not 2007. Change the date to what was actually
used, and record the newly sampled values beside it.

- [ ] **Step 4: Run the gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pastiche-pages.mjs
git commit -m "feat(pastiches): hi5 and Sonico wear the window shape they always had

Both are panels welded under solid title bars, which is exactly what corners,
heading_corners and heading_gap were added for and what neither page used.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Facebook and Fotolog, on partial evidence

Both replay without their stylesheets. What can be read off them is the
arrangement and any colour set inline; what cannot is anything the stylesheet
governed. **Say which is which in each comment** rather than treating a partial
capture as a full one.

**Files:**

- Modify: `scripts/pastiche-pages.mjs` — `facebook`, `facebookTheme`,
  `fotolog`, `fotologTheme`

- [ ] **Step 1: Fetch and sample both**

```bash
curl -s --max-time 180 -o "$TMPDIR/facebook.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20080215125110/http://www.facebook.com/"))')"
curl -s --max-time 180 -o "$TMPDIR/fotolog.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20080215112915/http://www.fotolog.com/"))')"
node "$TMPDIR/sample.mjs" "$TMPDIR/facebook.png"
node "$TMPDIR/sample.mjs" "$TMPDIR/fotolog.png"
```

- [ ] **Step 2: Facebook — keep the navy, add the shape**

`#3b5998` is confirmed by the capture and stays. The page already uses
`heading: "soft"` for its second bar, which is what that key was added for.
What it lacks is the window shape: add `corners: "tl,tr"` and
`heading_gap: "none"` to the barred sections, matching the flat squared boxes
in the capture.

- [ ] **Step 3: Fotolog — label it correctly**

Its comment currently implies knowledge-built. The honest label is partial: the
nav replays unstyled, and the table-and-inline-styled content panels render.
Record which of its values are sampled from the capture (the `#eeeeee` panels
and white ground, if the sample confirms them) and which remain recalled.

Fotolog is one enormous photograph over a guestbook. Confirm the capture's
density — small type, tight rows — and set `spacing: "compact"` if it is not
already.

- [ ] **Step 4: Run the gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pastiche-pages.mjs
git commit -m "feat(pastiches): Facebook and Fotolog, on evidence that says what it covers

Both replay without their stylesheets, so each comment now separates what was
sampled from what is still recalled. Fotolog is neither knowledge-built nor
evidence-backed and stops claiming to be either.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Fur Affinity and GeoCities

**Files:**

- Modify: `scripts/pastiche-pages.mjs` — `furaffinity`, `furaffinityTheme`,
  `geocities`, `geocitiesTheme`

- [ ] **Step 1: Fetch and sample Fur Affinity**

```bash
curl -s --max-time 180 -o "$TMPDIR/fa.png" \
  "https://arquivo.pt/screenshot?url=$(node -e 'process.stdout.write(encodeURIComponent("https://arquivo.pt/noFrame/replay/20191214070143/http://www.furaffinity.net/"))')"
node "$TMPDIR/shot.mjs" "$TMPDIR/fa.png" "$TMPDIR/fa-top.png" 0 1400
node "$TMPDIR/sample.mjs" "$TMPDIR/fa.png"
```

- [ ] **Step 2: Fur Affinity — the date mismatch is the finding**

The capture is **December 2019** and this page is dated 2008.
`web.archive.org`, where the original 2008 capture came from, is unreachable,
and arquivo holds nothing earlier than 2019 for this host. FA kept its classic
layout across that span, so the capture is good evidence for the chrome and
none for the date.

Two choices, and the comment must say which was taken: keep the page at 2008
and note that its chrome is confirmed by a later capture, or re-date the page
to what the evidence supports. **Prefer keeping 2008 and stating the
mismatch** — the palette correction it already carries came from a real 2008
capture, so the page is not without evidence; its evidence is a source that can
no longer be reached.

Apply the section-header shape the capture shows: light silver bars carrying
dark text, welded to their panels — `heading: "bar"`, `heading_gap: "none"`,
`corners: "tl,tr"`, `radius: "square"`.

- [ ] **Step 3: GeoCities — confirm, do not change**

Sample two or three pages from the restored gallery:

```bash
curl -s --max-time 60 "https://geocities.restorativland.org/Area51/" | head -60
```

The existing comment records five pages sampled: Times New Roman on all five,
grounds `#000000` / `#ffffff` / `#ff0000`, two of five tiling a background.
That evidence already confirmed the design rather than changing it, which is
the useful shape for evidence to have. **Expect to change nothing here.** If
the gallery is unreachable, say so in the comment and leave the page alone —
do not restyle on no evidence.

The one thing to add is the window shape's absence: a 1998 personal page has
**no** rounded corners anywhere, so `radius: "square"` belongs on every section
if it is not already there.

- [ ] **Step 4: Run the gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pastiche-pages.mjs
git commit -m "feat(pastiches): Fur Affinity's bars, and GeoCities left alone

FA's silver section bars weld to their panels, from a 2019 capture whose date
does not match the page's — stated rather than hidden, since the 2008 source
that set its palette is no longer reachable. GeoCities changes nothing: its
evidence confirmed the design, which is the useful shape for evidence to have.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Messenger, the board, Bluesky and Threads

The four pages with no archive capture of the right subject. Three have none at
all; Messenger has a screenshot rather than a replay. None of them gains a
capture-driven restyle — what they gain is the vocabulary they were written
before.

**Files:**

- Modify: `scripts/pastiche-pages.mjs` — `messenger`/`messengerTheme`,
  `board`/`boardTheme`, `sky`/`skyTheme`, `threads`/`threadsTheme`

- [ ] **Step 1: Messenger — the window shape it is literally a window for**

Its measurements are already right and were taken from Wikipedia's 8.0
screenshot: `#f8f8f8` panels over a `#193c74` navy bar, and the blue field kept
deliberately because `aero` is why the page exists. **Do not re-measure and do
not change either value.**

What it lacks is corners. A Messenger window is rounded at the top and square
at the foot — `corners: "tl,tr"` with `radius: "soft"` on each section, and
`heading_corners` matching on the barred one. Add `heading_gap: "none"` so the
title strip welds to the contact list beneath it.

Restate the fidelity-versus-purpose ruling in the comment: it is still true,
and a note that stops being restated is one the next person deletes.

- [ ] **Step 2: The board — nothing moves**

`#15202b` and `#1d9bf0` are a coherent ~2019 dark mode and the README already
dates it that way. It is `chrome: "bare"` throughout, which is right for a
feed. **Change nothing about its look.** Its inspiration section, from Task 3,
carries the reason no capture can exist.

- [ ] **Step 3: Bluesky and Threads — confirm the live measurements still hold**

Both were measured live on 2026-08-29 and both notes state the environment.
Re-measure to confirm nothing moved, and record the date of the re-check:

```bash
cat > "$TMPDIR/live.mjs" <<'EOF'
import { createRequire } from "node:module";
const require = createRequire("file:///Z:/Github/aeleos/apps/hub/package.json");
const { chromium } = require("@playwright/test");
const [, , url, scheme = "light"] = process.argv;
const b = await chromium.launch();
const p = await b.newPage({ colorScheme: scheme });
await p.goto(url, { waitUntil: "networkidle" });
console.log(
  await p.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { background: s.backgroundColor, color: s.color };
  }),
);
await b.close();
EOF
node "$TMPDIR/live.mjs" "https://bsky.app/" light
node "$TMPDIR/live.mjs" "https://www.threads.net/" dark
```

**A live site is evidence about today, and today is not always the era being
imitated.** Threads has since moved its profile into a rounded card on a grey
field; this page is the 2023 edge-to-edge one. If the reading has moved, do
**not** chase it — record that it moved and that the page stays where it is.

- [ ] **Step 4: Run the gate**

```bash
pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/pastiche-pages.mjs
git commit -m "feat(pastiches): Messenger gets the window shape; three pages keep their own

A Messenger window rounds at the top and squares at the foot, which corners now
draws. The board, Bluesky and Threads are unchanged: their palettes are already
measured, and their inspiration sections carry the reason no capture exists.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: The five era looks

**Files:**

- Modify: `apps/hub/src/features/actors/domain/era-looks.ts`
- Modify: `scripts/era-looks.generated.json` (regenerated, never hand-edited)

**These are the picker's templates.** Only their look changes — no inspiration
section, no reference, nothing decorative. Task 4 already appends their
sections at seed time.

- [ ] **Step 1: Fetch the five references**

```bash
for u in \
  "https://upload.wikimedia.org/wikipedia/en/0/00/Windows98.png" \
  "https://upload.wikimedia.org/wikipedia/en/6/64/Windows_XP_Luna.png" \
  "https://upload.wikimedia.org/wikipedia/en/a/a3/Windows_Vista.png" \
  "https://upload.wikimedia.org/wikipedia/en/5/50/Windows_7_SP1_screenshot.png" \
  "https://upload.wikimedia.org/wikipedia/en/8/8e/Windows_8_Start_Screen.png" \
; do
  n=$(basename "$u"); curl -s -A 'aeleos-research/1.0' --max-time 60 -o "$TMPDIR/$n" "$u"
  echo "=== $n"; node "$TMPDIR/sample.mjs" "$TMPDIR/$n"
done
```

- [ ] **Step 2: Apply what the five are missing**

All five already use `corners` and `radius` — the gap here is the other four
keys, used **zero** times across the file: `heading_image`, `heading_fit`,
`heading_gap` and `heading_pad`.

- **Windows 98:** the title bar is a flat navy with tight padding.
  `heading_pad: "snug"` and `heading_gap: "none"`. `radius: "square"` is
  already right — 98 has no rounded corner anywhere.
- **Windows XP:** Luna's bar is a blue gradient rounded across its top over a
  near-white body, join straight. Confirm `corners`/`heading_corners` already
  express this, and add `heading_gap: "none"` so the bar welds.
- **Vista and Windows 7:** both `aero`, differing by palette. Sample each
  screenshot and confirm the two palettes are still distinguishable — the plan
  they were built from records them as dark-tinted-on-green and
  light-tinted-on-blue. Add `heading_pad: "roomy"`, since both eras give a
  title bar noticeably more room than XP does.
- **Windows 8:** the arrangement lands and per-block colour is refused by
  design, which stands. `heading_gap: "none"` and `heading_pad: "snug"` are
  what Metro's flat labels want. **Do not attempt per-tile colour** — that is a
  standing ruling, and reopening it is a decision rather than a patch.

- [ ] **Step 3: Regenerate the artefact**

```bash
UPDATE_ERA_LOOKS=1 pnpm --filter hub exec vitest run tests/era-looks-json.test.ts
```

Then run it again **without** the variable, to prove it is in step:

```bash
pnpm --filter hub exec vitest run tests/era-looks-json.test.ts
```

Expected: PASS. Never hand-edit `scripts/era-looks.generated.json`.

- [ ] **Step 4: Run every gate**

```bash
pnpm --filter hub test && pnpm --filter hub exec vitest run tests/pastiche-pages.test.ts
```

Expected: PASS, hub coverage still at 100%.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/domain/era-looks.ts scripts/era-looks.generated.json
git commit -m "feat(era-looks): the title bars get the four keys they never used

heading_image, heading_fit, heading_gap and heading_pad appear zero times
across the five looks. Windows 8 keeps its standing refusal of per-tile colour;
that is a ruling, not a gap to patch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Re-derive the summary tables from the file

Root rule 30 was paid for here already: five of eleven rows in the findings
document's table were false, because the pages changed and the table described
them as they had been. **Extract the summary rather than reading it.**

**Files:**

- Modify: `README.md` — the two showcase tables at lines ~71–81 and ~131–135
- Modify: `docs/superpowers/specs/2026-08-27-pastiche-findings.md`

- [ ] **Step 1: Derive what each page actually uses**

```bash
node --input-type=module -e '
import { PAGES, ERA_LOOKS } from "./scripts/pastiche-pages.mjs";
const walk = (b, out) => {
  if (b.mode) out.modes.add(b.mode);
  if (b.kind && b.kind !== "container") out.kinds.add(b.kind);
  for (const k of Object.keys(b.style ?? {})) out.style.add(k);
  (b.children ?? []).forEach((c) => walk(c, out));
  return out;
};
const rows = [
  ...PAGES.map((p) => [p.handle, p.blocks, p.theme]),
  ...ERA_LOOKS.map((l) => [l.id, l.blocks, l.theme]),
];
for (const [id, blocks, theme] of rows) {
  const out = { modes: new Set(), kinds: new Set(), style: new Set() };
  blocks.forEach((b) => walk(b, out));
  console.log(
    id.padEnd(12),
    "skin=" + theme.skin,
    "font=" + theme.font,
    "measure=" + theme.measure,
    "canvas=" + theme.canvas,
    "| modes:", [...out.modes].join(","),
    "| style:", [...out.style].sort().join(","),
  );
}
'
```

- [ ] **Step 2: Rewrite each table row against that output**

Every row naming a skin, a mode, a canvas or a measure is a claim about
`pastiche-pages.mjs`, and `check:docs` cannot see it because no TypeScript
symbol moved. Correct each row to what the command printed. Where a row is now
worth naming a newly-used key — the window shape on hi5, Sonico, Messenger and
Fur Affinity — say so, since that is what this work added.

- [ ] **Step 3: Update the findings document**

Add the corrections this work established, and **delete rather than soften**
any sentence it made false:

- Fotolog is neither knowledge-built nor evidence-backed; it has partial
  evidence and the caveat is the label.
- Bluesky and Threads have archive history that is not of the right subject —
  sharper than "there is no archive", and the claim that tells the next person
  not to look again.
- A portal capture is not a page capture; `profile.myspace.com` held 43 real
  profile captures the whole time.
- Gap 10 is closed for the social pages too, not only the era looks.
- Any gap this work opened — most likely MySpace's semi-transparent boxes from
  Task 5 — gets a number and a description of what was tried.

- [ ] **Step 4: Run the documentation gates**

```bash
npx prettier --write README.md docs/superpowers/specs/2026-08-27-pastiche-findings.md
npx cspell --no-progress README.md docs/superpowers/specs/2026-08-27-pastiche-findings.md
```

Expected: PASS. Add any new proper noun to `cspell.json` **with a comment
saying why**, matching that file's style.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/superpowers/specs/2026-08-27-pastiche-findings.md cspell.json
git commit -m "docs(pastiches): the tables re-derived from the file, not from memory

Every row naming a skin, mode, canvas or measure is a claim about
pastiche-pages.mjs that check:docs structurally cannot see. Extracted with a
script rather than read, which is how five false rows were found last time.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Seed, photograph, and read the pictures back

**Files:** none committed. This task produces evidence, not code.

- [ ] **Step 1: Rebase onto `main` first**

```bash
git fetch origin
git rebase origin/main
```

**The seeder writes production from whatever tree you are standing in.**
Seeding from a branch cut before someone else's change silently undoes it.

- [ ] **Step 2: Seed**

```bash
set -a; . ./.secrets; set +a
node scripts/seed-pastiches.mjs
```

Expected: sixteen lines, eleven `[pastiche]` and five `[era]`.

- [ ] **Step 3: Photograph all sixteen**

```bash
cat > "$TMPDIR/shots.mjs" <<'EOF'
import { createRequire } from "node:module";
const require = createRequire("file:///Z:/Github/aeleos/apps/hub/package.json");
const { chromium } = require("@playwright/test");
const handles = [
  "myspace", "messenger", "board", "sky", "threads", "hi5", "sonico",
  "geocities", "furaffinity", "fotolog", "facebook",
  "era-win98", "era-winxp", "era-vista", "era-win7", "era-win8",
];
const b = await chromium.launch();
for (const h of handles) {
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(`https://me.furrycolombia.com/en/137/${h}`, {
    waitUntil: "networkidle",
  });
  await p.screenshot({ path: `${process.env.TMPDIR}/page-${h}.png`, fullPage: true });
  console.log("shot", h);
  await p.close();
}
await b.close();
EOF
node "$TMPDIR/shots.mjs"
```

Do **not** set `PLAYWRIGHT_BASE_URL` — and unset it if it is set. A picture of
the deployed site is only proof after this commit is what production serves;
here the seeder has written production directly, so the pages are current even
though the code is not deployed.

- [ ] **Step 4: Read every picture back, as a separate pass**

This is a distinct step and the one most often skipped. Open each of the
sixteen and ask **not** "does this show what I claimed" but **"what else is in
this frame, and is any of it wrong"**. Walk the whole frame: edges and corners,
anything overlapping anything, anything clipped, a control landed on another,
text that is a raw message key, a colour that did not apply.

Specifically for this work, three things only this pass can catch:

- **A capture that failed to load** shows as an empty box or a broken image,
  and every gate in this plan passes with it broken — the URL is a string and
  nothing fetches it at build time.
- **A capture that loaded but is the wrong page** — an archive error placeholder
  rather than the site.
- **An inspiration section that swamped the page**, since the captures are tall
  full-page renders and `image_fit: "contain"` inside a `stack` may give one an
  enormous box.

Fix anything found, re-seed, re-photograph, and read back again.

- [ ] **Step 5: Report, and stop**

Summarise: which pages changed, what each capture shows, what the read-back
pass found, and any gap written into the findings document. **Do not open a
pull request** — ask first.

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: the vocabulary
argument to Tasks 5–10; the evidence table to Task 3's registry; the mechanism
to Task 3; the inspiration section and its `ERA_LOOKS` ruling to Tasks 3 and 4;
the two recurring rulings to Tasks 5 and 9; "what must not change" to the
global constraints; verification to Tasks 2, 11 and 12; the risks to Task 3
step 6 and Task 12 step 4.

**Placeholders.** None. Every code step carries the code; every measurement
step carries the command; the two throwaway tools are given in full rather than
described.

**Type consistency.** `PAGES` is objects with `handle`/`displayName`/`blocks`/
`theme`/`avatar` from Task 1 and is destructured that way in Tasks 4 and 11.
`REFERENCES` is keyed by the same `handle`, checked against the seeded set in
Task 4 step 1. `captureUrl` and `inspirationSection` keep one signature
throughout.

**One thing the plan cannot promise.** Task 5's semi-transparent boxes may not
be reachable — a block's fill is derived and there is no opacity key. The task
says to write it up as a numbered gap rather than approximate it, which is this
repository's standing answer and the reason the pastiches exist at all.
