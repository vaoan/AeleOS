# Retro players, phase 1 — the archive and the atlas

**Status:** COMPLETE, 2026-08-19. 33 tests, both modules at 100% on every
metric, every guard sabotage-verified, all gates green.

**Four things this plan got wrong, left as corrections rather than quietly
fixed**, because each is a trap the next phase can walk into:

1. **`readSkinArchive` takes an `ArrayBuffer`, not a `Uint8Array`.** TypeScript
   will not narrow `Uint8Array<ArrayBufferLike>` to the `BufferSource` a
   compression stream's writable side declares — `SharedArrayBuffer` is in the
   union — so the plan's signature does not compile. Taking the buffer is also
   what every real caller already holds, from `response.arrayBuffer()`.
2. **The font map must be built with `flatMap` keeping the ORIGINAL index, not
   `filter().map()`.** The plan wrote the latter, which renumbers every cell
   after the two dead ones and slides the space from column 30 to 28 — the
   exact bug `NO_CHARACTER` exists to prevent, reintroduced by the code meant
   to implement it.
3. **Vitest's jsdom environment has two `Uint8Array` realms.**
   `new TextEncoder().encode()` answers Node's while the global `Uint8Array` is
   jsdom's, so `encoded instanceof Uint8Array` is FALSE and `toEqual` refuses
   the comparison — reporting "Compared values have no visual difference" over
   two byte-identical arrays. Every byte assertion compares content instead.
4. **`.split("/").pop() ?? ""` is an unreachable branch** and would have held
   coverage under the threshold for ever with no case to write. `slice` has no
   such branch.

Two smaller notes. `sonarjs/cognitive-complexity` refuses the single-function
reader at 23 and again at 21, which is fair — it is three concerns, and
`readCentralRecord`, `payloadOf`, `isReadable` and `keyOf` are the split. And
`apps/hub/coverage/` was in neither `.gitignore` nor `.prettierignore`, so the
coverage gate created a directory the format gate then failed on; fixed in the
same commit.

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read a Winamp `.wsz` skin archive into named sprite sheets, and hold
the rectangle of every sprite within them — with no dependency, no DOM, and no
UI.

**Architecture:** Two pure modules in `features/actors/domain`. `wsz.ts` walks a
ZIP central directory and inflates entries through the platform's own
`DecompressionStream("deflate-raw")`, returning a depth-tolerant,
case-insensitive map of canonical filename to bytes. `skin-sprites.ts` is the
atlas: a table of rectangles per sheet, derived from Webamp's MIT
`skinSprites.ts` and cross-checked against a real museum skin.

**Tech Stack:** TypeScript, zod-free (this is not parsed user data yet), vitest
in jsdom. **No new packages.**

**Spec:** `docs/superpowers/specs/2026-08-19-retro-players-design.md`

## Global Constraints

- **Nothing is added to `package.json`.** If a task seems to need a dependency,
  the task is wrong — stop and say so.
- **`wsz.ts` must never construct a `Blob`.** jsdom supplies its own `Blob`
  without `.stream()` and it shadows Node's, so `new Blob([b]).stream()` throws
  `(intermediate value).stream is not a function` in the unit suite while
  working fine in a browser. Feed a `ReadableStream` directly. Spec §9.
- **Every export carries TSDoc stating the contract, not the types.**
  `pnpm lint` fails without it.
- **100% branch coverage**, and every guard sabotage-verified: break the code,
  watch the test go red, restore.
- Filenames kebab-case. Both message catalogues stay in step (not this phase —
  no user-facing strings here).
- Layering: `features/actors/domain` may import only `features/actors/domain`,
  `shared/domain` and `@aeleos/identity`. No framework, no React, no `../`.

---

## File Structure

| File                                                  | Responsibility                                     |
| ----------------------------------------------------- | -------------------------------------------------- |
| `apps/hub/src/features/actors/domain/wsz.ts`          | ZIP → canonical filename → bytes                   |
| `apps/hub/src/features/actors/domain/skin-sprites.ts` | the sprite atlas, as data                          |
| `apps/hub/tests/wsz.test.ts`                          | archive reader, against archives built in the test |
| `apps/hub/tests/skin-sprites.test.ts`                 | atlas shape and self-consistency                   |

Nothing else is touched. No barrel export yet — nothing outside the feature
consumes these until phase 3, and exporting early would put an unused symbol in
`index.ts` for `knip` to report.

---

### Task 1: The archive reader

**Files:**

- Create: `apps/hub/src/features/actors/domain/wsz.ts`
- Test: `apps/hub/tests/wsz.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  ```ts
  export type SkinArchive =
    | { readonly ok: true; readonly files: ReadonlyMap<string, Uint8Array> }
    | { readonly ok: false; readonly reason: SkinArchiveProblem };
  export type SkinArchiveProblem = "not-an-archive" | "no-sprites";
  export function readSkinArchive(bytes: Uint8Array): Promise<SkinArchive>;
  ```
  Keys of `files` are **lowercased basenames** — `"main.bmp"`, never
  `"3DNow/main.bmp"` and never `"MAIN.BMP"`. Phase 3 joins this map against
  `SKIN_SPRITES` by exactly those keys.

**The rules, each of which exists because a real skin needed it:**

1. **Depth-tolerant.** The first museum skin opened had every file inside a
   `3DNow/` folder. Key on the basename.
2. **Case-insensitive.** That same skin held `shufrep.BMP`, `Eqmain.bmp` and
   `PLEDIT.TXT` beside `main.bmp`. Lowercase the key.
3. **Shallower wins on collision**, first wins on a tie. A skin that ships
   `main.bmp` at the root and `old/main.bmp` beneath means the root one.
4. **Directory entries are skipped** — they are zero-length and their names end
   in `/`.
5. **Stored (method 0) and deflated (method 8) are read; any other method is
   skipped, not thrown.** One odd entry must not cost a skin its other
   nineteen.
6. **`no-sprites` when the archive parses but holds no `main.bmp`.** That is
   how the editor tells "this is not a skin" from "this is not a file", and
   both need different words.

- [ ] **Step 1: Write the failing tests**

Create `apps/hub/tests/wsz.test.ts`. The helper builds archives in-test, which
is deliberate — a synthetic archive can be made more hostile than any real one,
and it keeps somebody else's artwork out of the repository.

```ts
import { describe, expect, it } from "vitest";
import { readSkinArchive } from "@/features/actors/domain/wsz";

interface Entry {
  name: string;
  bytes: Uint8Array;
  /** 0 = stored, 8 = deflated, anything else = a method we do not read. */
  method?: number;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  const out = await new Response(
    source.pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  return new Uint8Array(out);
}

/** Builds a ZIP with a real central directory, so the reader is not humoured. */
async function makeZip(entries: Entry[]): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 0;
    const payload = method === 8 ? await deflate(e.bytes) : e.bytes;
    const name = utf8(e.name);
    const local = new Uint8Array(30 + name.length + payload.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, e.bytes.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, e.bytes.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + cdSize + eocd.length;
  const zip = new Uint8Array(total);
  let at = 0;
  for (const l of locals) {
    zip.set(l, at);
    at += l.length;
  }
  for (const c of centrals) {
    zip.set(c, at);
    at += c.length;
  }
  zip.set(eocd, at);
  return zip;
}

const main = utf8("BM main pixels");

describe("readSkinArchive", () => {
  it("reads a stored entry", async () => {
    const zip = await makeZip([{ name: "main.bmp", bytes: main }]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.get("main.bmp")).toEqual(main);
  });

  it("inflates a deflated entry", async () => {
    // Repetitive so DEFLATE genuinely compresses it — a payload that deflates
    // LARGER than it started would let a stored-only reader pass this case.
    const bytes = utf8("BM".concat("x".repeat(4000)));
    const zip = await makeZip([
      { name: "main.bmp", bytes },
      { name: "cbuttons.bmp", bytes, method: 8 },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.get("cbuttons.bmp")).toEqual(bytes);
  });

  it("keys on the basename, however deep", async () => {
    const zip = await makeZip([
      { name: "3DNow/deeper/main.bmp", bytes: main, method: 8 },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.files.keys()]).toEqual(["main.bmp"]);
  });

  it("lowercases the key", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      { name: "Skin/SHUFREP.BMP", bytes: utf8("shuf") },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.get("shufrep.bmp")).toEqual(utf8("shuf"));
  });

  it("prefers the shallower of two entries with one name", async () => {
    // The deep one comes FIRST, so a reader that merely keeps the first entry
    // would pass by accident. Rule 27: the fixture must be able to tell the
    // right answer from the wrong one.
    const zip = await makeZip([
      { name: "old/main.bmp", bytes: utf8("deep") },
      { name: "main.bmp", bytes: utf8("shallow") },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.get("main.bmp")).toEqual(utf8("shallow"));
  });

  it("keeps the first of two entries at equal depth", async () => {
    const zip = await makeZip([
      { name: "a/main.bmp", bytes: utf8("first") },
      { name: "b/main.bmp", bytes: utf8("second") },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.get("main.bmp")).toEqual(utf8("first"));
  });

  it("skips directory entries", async () => {
    const zip = await makeZip([
      { name: "3DNow/", bytes: new Uint8Array(0) },
      { name: "3DNow/main.bmp", bytes: main },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.files.keys()]).toEqual(["main.bmp"]);
  });

  it("skips an entry compressed by a method it cannot read, and keeps the rest", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      { name: "weird.bmp", bytes: utf8("bzip2?"), method: 12 },
    ]);
    const result = await readSkinArchive(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.has("main.bmp")).toBe(true);
    expect(result.files.has("weird.bmp")).toBe(false);
  });

  it("refuses something that is not an archive", async () => {
    const result = await readSkinArchive(utf8("<!doctype html><h1>404</h1>"));
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses an archive with no main.bmp", async () => {
    const zip = await makeZip([{ name: "readme.txt", bytes: utf8("hi") }]);
    const result = await readSkinArchive(zip);
    expect(result).toEqual({ ok: false, reason: "no-sprites" });
  });

  it("refuses an entry whose payload is truncated", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: utf8("x".repeat(2000)), method: 8 },
    ]);
    const result = await readSkinArchive(zip.subarray(0, zip.length - 40));
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
cd apps/hub && npx vitest run tests/wsz.test.ts
```

Expected: every case fails to resolve `@/features/actors/domain/wsz`.

- [ ] **Step 3: Write `wsz.ts`**

```ts
/**
 * The end-of-central-directory signature, `PK\5\6`.
 *
 * Searched backwards from the end because a ZIP may carry a trailing comment
 * of up to 65,535 bytes after it.
 */
const EOCD_SIGNATURE = 0x06054b50;

/** The central-directory file-header signature, `PK\1\2`. */
const CENTRAL_SIGNATURE = 0x02014b50;

/** Stored: the payload is the file. */
const METHOD_STORED = 0;

/** Deflated: the payload is raw DEFLATE, which the platform can inflate. */
const METHOD_DEFLATE = 8;

/** The one sprite sheet every classic skin has, and what we test for. */
const REQUIRED_SHEET = "main.bmp";

/** Why an archive could not be read as a skin. */
export type SkinArchiveProblem = "not-an-archive" | "no-sprites";

/**
 * A skin's files, or the reason there are none.
 *
 * The two failures are kept apart because they need different words in front
 * of somebody: `not-an-archive` is usually a link that answered with an error
 * page, and `no-sprites` is usually a zip of something else entirely.
 */
export type SkinArchive =
  | { readonly ok: true; readonly files: ReadonlyMap<string, Uint8Array> }
  | { readonly ok: false; readonly reason: SkinArchiveProblem };

/**
 * Inflates one raw-DEFLATE payload.
 *
 * **Never through a `Blob`.** jsdom supplies its own `Blob` without
 * `.stream()`, and it shadows Node's — so the obvious construction works in a
 * browser and throws in the unit suite, naming `Blob` rather than the
 * environment. Feeding a `ReadableStream` avoids the question and allocates
 * less.
 *
 * @param payload - the compressed bytes.
 * @returns the inflated bytes.
 */
async function inflate(payload: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
  const inflated = await new Response(
    source.pipeThrough(new DecompressionStream("deflate-raw")),
  ).arrayBuffer();
  return new Uint8Array(inflated);
}

/**
 * Finds the end-of-central-directory record.
 *
 * @param view - the whole archive.
 * @returns its offset, or -1 when there is none.
 */
function findEndOfCentralDirectory(view: DataView): number {
  for (let at = view.byteLength - 22; at >= 0; at--) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  return -1;
}

/**
 * How deep a path sits, so the shallower of two same-named entries can win.
 *
 * @param name - the entry's stored path.
 * @returns the number of directory separators in it.
 */
function depthOf(name: string): number {
  let depth = 0;
  for (const character of name) if (character === "/") depth++;
  return depth;
}

/**
 * Reads a `.wsz` (an ordinary ZIP) into its sprite sheets.
 *
 * Keys are **lowercased basenames**, which is what makes this survive the two
 * variations real skins actually have: the first museum skin opened kept every
 * file inside a `3DNow/` folder, and spelled three of them `shufrep.BMP`,
 * `Eqmain.bmp` and `PLEDIT.TXT`. A reader keyed on the stored path, or on
 * case, finds nothing in either.
 *
 * **Refusing is an ordinary outcome and never throws.** A pasted address is as
 * likely to answer with an HTML error page as with a skin, and the caller has
 * somewhere to put both reasons — see {@link SkinArchiveProblem}.
 *
 * **An entry it cannot read is skipped rather than fatal.** A skin is twenty
 * files and one of them being compressed by something exotic must not cost the
 * other nineteen.
 *
 * @param bytes - the whole archive.
 * @returns the files, or why there are none.
 */
export async function readSkinArchive(bytes: Uint8Array): Promise<SkinArchive> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return { ok: false, reason: "not-an-archive" };

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const files = new Map<string, Uint8Array>();
  const depths = new Map<string, number>();

  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length) return { ok: false, reason: "not-an-archive" };
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      return { ok: false, reason: "not-an-archive" };
    }
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localHeader = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLength),
    );
    at += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/")) continue;
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) continue;

    const key = (name.split("/").pop() ?? "").toLowerCase();
    if (!key) continue;
    const depth = depthOf(name);
    const seen = depths.get(key);
    if (seen !== undefined && seen <= depth) continue;

    if (localHeader + 30 > bytes.length) {
      return { ok: false, reason: "not-an-archive" };
    }
    const localNameLength = view.getUint16(localHeader + 26, true);
    const localExtraLength = view.getUint16(localHeader + 28, true);
    const start = localHeader + 30 + localNameLength + localExtraLength;
    if (start + compressedSize > bytes.length) {
      return { ok: false, reason: "not-an-archive" };
    }
    const payload = bytes.subarray(start, start + compressedSize);

    try {
      files.set(
        key,
        method === METHOD_DEFLATE ? await inflate(payload) : payload,
      );
      depths.set(key, depth);
    } catch {
      // A payload that says it is DEFLATE and is not. One bad sheet must not
      // cost the skin, so it is dropped exactly like an unreadable method.
      continue;
    }
  }

  if (!files.has(REQUIRED_SHEET)) return { ok: false, reason: "no-sprites" };
  return { ok: true, files };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
cd apps/hub && npx vitest run tests/wsz.test.ts
```

Expected: 11 passed.

- [ ] **Step 5: Sabotage-verify the three rules that could pass by accident**

Do all three, watch each go red, restore each:

1. Change `key` to `name.toLowerCase()` (drop the basename split) → "keys on
   the basename" and "lowercases the key" go red.
2. Change `seen <= depth` to `seen < depth` → "keeps the first of two entries
   at equal depth" goes red.
3. Change `method !== METHOD_STORED && method !== METHOD_DEFLATE` to
   `method === 99` → the exotic-method case goes red.

If any of the three stays green, the fixture cannot tell the right behaviour
from the wrong one and **the fixture is what needs fixing**, not the assertion.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/wsz.ts apps/hub/tests/wsz.test.ts
git commit -m "feat(actors): read a .wsz skin archive with no dependency"
```

---

### Task 2: The sprite atlas

**Files:**

- Create: `apps/hub/src/features/actors/domain/skin-sprites.ts`
- Test: `apps/hub/tests/skin-sprites.test.ts`

**Interfaces:**

- Consumes: nothing (`readSkinArchive`'s keys, by convention — the sheet names
  here are exactly the keys that map produces).
- Produces:
  ```ts
  export interface SkinSprite {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }
  export const SKIN_SHEETS: readonly string[];
  export const SKIN_SPRITES: ReadonlyMap<string, SkinSprite>;
  export function spriteSheet(name: string): string | undefined;
  export function skinSprite(name: string): SkinSprite | undefined;
  export const FONT_CHARACTERS: ReadonlyMap<string, SkinSprite>;
  export function fontCharacter(character: string): SkinSprite | undefined;
  ```

**Where the numbers come from, and why that is stated rather than assumed.**
The table is derived from `packages/webamp/js/skinSprites.ts` in
`captbaritone/webamp` (MIT), which is the only version of these coordinates
that has been run against ~100,000 skins. Attribution goes in the file header.
It was cross-checked against a real museum skin's actual BMP dimensions before
being trusted, and that check found the property task 3 of phase 3 depends on:

| sheet          | atlas extent | this skin's sheet |
| -------------- | ------------ | ----------------- |
| `main.bmp`     | 275×116      | 275×116           |
| `cbuttons.bmp` | 136×36       | 136×36            |
| `volume.bmp`   | 68×433       | 68×433            |
| `posbar.bmp`   | 307×10       | 307×10            |
| `shufrep.bmp`  | 92×85        | 92×85             |
| `nums_ex.bmp`  | **108×13**   | **99×13**         |
| `playpaus.bmp` | **48×9**     | **42×9**          |

**The atlas is the format's, not any one skin's.** Two sheets in that skin are
smaller than the atlas expects, and it is a perfectly ordinary skin. So a
sprite may legitimately fall outside its sheet, CSS draws nothing there, and
that is **not** an error condition to detect. A reader that validates sprites
against sheet dimensions would reject real skins.

- [ ] **Step 1: Generate the table**

The 180-line body is mechanical and must not be hand-typed. Run this once from
the repository root; it writes the table body to a scratch file which step 2
pastes into the module.

```bash
cd "$CLAUDE_JOB_DIR/tmp" 2>/dev/null || cd /tmp
curl -sL "https://raw.githubusercontent.com/captbaritone/webamp/master/packages/webamp/js/skinSprites.ts" -o skinSprites.ts
node -e '
const fs=require("fs");
const s=fs.readFileSync("skinSprites.ts","utf8");
const head="const sprites: SpriteMap = {";
const body=s.slice(s.indexOf(head)+head.length);
let d=1,i=0; for(;i<body.length;i++){ if(body[i]==="{")d++; else if(body[i]==="}"){d--; if(!d)break;} }
const characterSprites=[];
const obj=eval("({"+body.slice(0,i)+"})");
const file={MAIN:"main.bmp",CBUTTONS:"cbuttons.bmp",TITLEBAR:"titlebar.bmp",VOLUME:"volume.bmp",BALANCE:"balance.bmp",POSBAR:"posbar.bmp",NUMBERS:"numbers.bmp",NUMS_EX:"nums_ex.bmp",PLAYPAUS:"playpaus.bmp",MONOSTER:"monoster.bmp",SHUFREP:"shufrep.bmp",PLEDIT:"pledit.bmp"};
let out="";
for(const [k,v] of Object.entries(file)){
  out+=`  ["${v}", {\n`;
  for(const sp of obj[k]) out+=`    ${sp.name}: { x: ${sp.x}, y: ${sp.y}, width: ${sp.width}, height: ${sp.height} },\n`;
  out+="  }],\n";
}
fs.writeFileSync("atlas-body.txt", out);
console.log("sheets:", Object.keys(file).length, "lines:", out.split("\n").length);
'
```

Expected: `sheets: 12 lines: 183`.

- [ ] **Step 2: Write `skin-sprites.ts`**

Header, then the generated body inside `SHEET_SPRITES`, then the derived
lookups. The font block is written by hand because it is a formula rather than
a table — Winamp's `text.bmp` is a grid of 5×6 characters, three rows.

```ts
/**
 * Where every sprite sits inside a classic Winamp skin's sheets.
 *
 * The coordinates are derived from `packages/webamp/js/skinSprites.ts` in
 * https://github.com/captbaritone/webamp (MIT, © Jordan Eldredge), which is
 * the only version of them proven against the ~100,000 skins in the Winamp
 * Skin Museum.
 *
 * **The atlas describes the FORMAT, not any one skin.** Real skins are
 * routinely smaller than it: the sheet this table was cross-checked against
 * has `nums_ex.bmp` at 99×13 where the atlas reaches 108, and `playpaus.bmp`
 * at 42×9 where it reaches 48. A sprite falling outside its sheet is therefore
 * ordinary — CSS draws nothing there — and must never be treated as
 * corruption. Validating sprites against sheet dimensions would reject skins
 * that work.
 */
export interface SkinSprite {
  /** Offset from the sheet's left edge, in skin pixels. */
  readonly x: number;
  /** Offset from the sheet's top edge, in skin pixels. */
  readonly y: number;
  /** How wide to cut, in skin pixels. */
  readonly width: number;
  /** How tall to cut, in skin pixels. */
  readonly height: number;
}

/** One sheet's sprites, by the name a renderer asks for. */
type Sheet = Readonly<Record<string, SkinSprite>>;

/**
 * Every sheet, keyed by the **lowercased basename** `readSkinArchive` produces.
 *
 * The two are joined by these strings and nothing enforces that but this
 * sentence and `skin-sprites.test.ts`, which checks each key is lowercase and
 * ends in `.bmp`.
 */
const SHEET_SPRITES: ReadonlyMap<string, Sheet> = new Map<string, Sheet>([
  // ← the generated body from step 1 goes here, verbatim
]);

/** Every sheet a skin may supply, in atlas order. */
export const SKIN_SHEETS: readonly string[] = [...SHEET_SPRITES.keys()];

/** How wide one character of `text.bmp` is. */
const CHARACTER_WIDTH = 5;

/** How tall one character of `text.bmp` is. */
const CHARACTER_HEIGHT = 6;

/**
 * A cell of `text.bmp` that holds no character.
 *
 * **Two of them sit between `@` and the space on the first row**, which is the
 * whole reason this constant exists: writing that row as
 * `'abcdefghijklmnopqrstuvwxyz"@ '` puts the space at column 28 where the font
 * has it at 30, and every string drawn after a space is then two cells
 * left of where it belongs — an error that looks like a rendering bug and is a
 * table bug. Read off `FONT_LOOKUP` rather than counted by eye.
 *
 * **It is deliberately not a space**, which it obviously wants to be: the
 * row's real space is the cell at column 30, and a sentinel equal to it would
 * be filtered out along with the dead pair — costing every track title its
 * word breaks. Written as an escape rather than as a literal, because a raw
 * NUL byte makes the whole file binary to `grep`.
 */
const NO_CHARACTER = "\u0000";

/**
 * Winamp's bitmap font, three rows of cells in `text.bmp`.
 *
 * The row and column of a character give its rectangle directly. The rows are
 * the alphabet, then digits and punctuation, then the accented characters and
 * the two remaining symbols, which is the order `text.bmp` has had since
 * Winamp 2.
 */
const FONT_ROWS = [
  `abcdefghijklmnopqrstuvwxyz"@${NO_CHARACTER}${NO_CHARACTER} `,
  "0123456789….:()-'!_+\\/[]^&%,=$#",
  "ÅÖÄ?*",
] as const;

/**
 * Characters Winamp draws out of another character's cell.
 *
 * The font has no angle or curly brackets, so all four borrow the square
 * ones. Without this they are misses, and a miss renders as a gap in somebody's
 * track title rather than as anything anyone would report.
 */
const FONT_ALIASES: ReadonlyMap<string, string> = new Map([
  ["<", "["],
  [">", "]"],
  ["{", "["],
  ["}", "]"],
]);

/**
 * Each character's rectangle within `text.bmp`, keyed in lower case.
 *
 * The font has one case — its glyphs are drawn as capitals — so `a` and `A`
 * are one cell, and `Å` is stored as `å` so that lower-casing the lookup
 * reaches both.
 */
export const FONT_CHARACTERS: ReadonlyMap<string, SkinSprite> = new Map(
  FONT_ROWS.flatMap((row, rowIndex) =>
    [...row]
      .map((character, columnIndex): [string, SkinSprite] => [
        character.toLowerCase(),
        {
          x: columnIndex * CHARACTER_WIDTH,
          y: rowIndex * CHARACTER_HEIGHT,
          width: CHARACTER_WIDTH,
          height: CHARACTER_HEIGHT,
        },
      ])
      .filter(([character]) => character !== NO_CHARACTER),
  ),
);

/**
 * Strips the accents off a character so a near-enough cell can be found.
 *
 * **This exists because the hub's fallback language is Spanish and the font
 * has no `n`-with-tilde.** Winamp's `text.bmp` carries the three Swedish
 * vowels and nothing else accented, so without a fold every `ñ` in a track
 * title is a miss, and a miss draws a hole. Folding gives `n` — visibly not
 * what was typed, and enormously better than a gap in the middle of a word.
 *
 * It runs only after an exact lookup has failed, so `å`, `ö` and `ä` keep
 * their own cells rather than being folded to bare vowels.
 *
 * @param character - one lower-cased character.
 * @returns it without diacritics, which may be more than one character.
 */
function withoutAccents(character: string): string {
  return character.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
}

/**
 * The cell one character is drawn from.
 *
 * Case-insensitive, and it tries three things in an order that matters: the
 * character itself, then the bracket aliases, then the same character with its
 * accents removed. Exact-first is what keeps `å` off `a`'s cell.
 *
 * A character with no cell at all — CJK, emoji — answers undefined, and the
 * caller draws nothing, which is what Winamp itself does.
 *
 * @param character - one character of a track title.
 * @returns its rectangle in `text.bmp`, or undefined.
 */
export function fontCharacter(character: string): SkinSprite | undefined {
  const lower = character.toLowerCase();
  const direct = FONT_CHARACTERS.get(lower);
  if (direct) return direct;
  const alias = FONT_ALIASES.get(character);
  if (alias !== undefined) return FONT_CHARACTERS.get(alias);
  return FONT_CHARACTERS.get(withoutAccents(lower));
}

/**
 * Every sprite in the atlas, flattened by name.
 *
 * A `Map` rather than a record, on this feature's standing rule: names reach
 * this lookup from data somebody else wrote, and a record has inherited
 * entries — the shape that once put `__proto__` through `TIDAL_KINDS`.
 */
export const SKIN_SPRITES: ReadonlyMap<string, SkinSprite> = new Map(
  [...SHEET_SPRITES.values()].flatMap((sheet) => Object.entries(sheet)),
);

/** Which sheet each sprite is cut from. */
const SPRITE_SHEET: ReadonlyMap<string, string> = new Map(
  [...SHEET_SPRITES].flatMap(([file, sheet]) =>
    Object.keys(sheet).map((name): [string, string] => [name, file]),
  ),
);

/**
 * The sheet a sprite is cut from.
 *
 * @param name - the sprite's name, such as `MAIN_PLAY_BUTTON`.
 * @returns the sheet's filename, or undefined when no sprite has that name.
 */
export function spriteSheet(name: string): string | undefined {
  return SPRITE_SHEET.get(name);
}

/**
 * One sprite's rectangle.
 *
 * @param name - the sprite's name, such as `MAIN_PLAY_BUTTON`.
 * @returns its rectangle, or undefined when no sprite has that name.
 */
export function skinSprite(name: string): SkinSprite | undefined {
  return SKIN_SPRITES.get(name);
}
```

- [ ] **Step 3: Write the tests**

```ts
import { describe, expect, it } from "vitest";
import {
  FONT_CHARACTERS,
  fontCharacter,
  SKIN_SHEETS,
  SKIN_SPRITES,
  skinSprite,
  spriteSheet,
} from "@/features/actors/domain/skin-sprites";

describe("the skin atlas", () => {
  it("names every sheet the way readSkinArchive keys them", () => {
    for (const sheet of SKIN_SHEETS) {
      expect(sheet).toBe(sheet.toLowerCase());
      expect(sheet.endsWith(".bmp")).toBe(true);
    }
  });

  it("holds the sheets the main window and playlist need", () => {
    expect(SKIN_SHEETS).toEqual([
      "main.bmp",
      "cbuttons.bmp",
      "titlebar.bmp",
      "volume.bmp",
      "balance.bmp",
      "posbar.bmp",
      "numbers.bmp",
      "nums_ex.bmp",
      "playpaus.bmp",
      "monoster.bmp",
      "shufrep.bmp",
      "pledit.bmp",
    ]);
  });

  it("gives the main window its documented size", () => {
    expect(skinSprite("MAIN_WINDOW_BACKGROUND")).toEqual({
      x: 0,
      y: 0,
      width: 275,
      height: 116,
    });
  });

  it("places the five transport buttons across cbuttons.bmp", () => {
    // Verified against a real skin: cbuttons.bmp is 136x36, two rows of 18.
    expect(skinSprite("MAIN_PLAY_BUTTON")).toEqual({
      x: 23,
      y: 0,
      width: 23,
      height: 18,
    });
    expect(skinSprite("MAIN_PLAY_BUTTON_ACTIVE")).toEqual({
      x: 23,
      y: 18,
      width: 23,
      height: 18,
    });
    expect(spriteSheet("MAIN_PLAY_BUTTON")).toBe("cbuttons.bmp");
  });

  it("gives no sprite a negative or zero dimension", () => {
    for (const [name, sprite] of SKIN_SPRITES) {
      expect(sprite.width, name).toBeGreaterThan(0);
      expect(sprite.height, name).toBeGreaterThan(0);
      expect(sprite.x, name).toBeGreaterThanOrEqual(0);
      expect(sprite.y, name).toBeGreaterThanOrEqual(0);
    }
  });

  it("answers undefined for a name no sprite has", () => {
    expect(skinSprite("MAIN_NOT_A_THING")).toBeUndefined();
    expect(spriteSheet("MAIN_NOT_A_THING")).toBeUndefined();
  });

  it("has no inherited entry to find", () => {
    // The `Map` rather than a record, stated as a test because the record
    // version of this lookup is what shipped a Critical once.
    expect(skinSprite("__proto__")).toBeUndefined();
    expect(spriteSheet("constructor")).toBeUndefined();
  });

  it("lays the font out five wide and six tall, three rows", () => {
    const cell = (x: number, y: number) => ({ x, y, width: 5, height: 6 });
    expect(fontCharacter("a")).toEqual(cell(0, 0));
    expect(fontCharacter("z")).toEqual(cell(125, 0));
    expect(fontCharacter("0")).toEqual(cell(0, 6));
    expect(fontCharacter("?")).toEqual(cell(15, 12));
  });

  it("puts the space at column 30, past the two dead cells", () => {
    // THE case this table gets wrong. `@` is column 27 and the space is column
    // 30, not 28 — every title with a space in it slides two cells left if the
    // dead pair is dropped. 30 * 5 = 150.
    expect(fontCharacter(" ")).toEqual({ x: 150, y: 0, width: 5, height: 6 });
    expect(fontCharacter("@")).toEqual({ x: 135, y: 0, width: 5, height: 6 });
  });

  it("keeps no cell for the two dead columns", () => {
    // A sentinel that leaked into the map would be reachable, and the two
    // columns it stands for are genuinely blank in every skin.
    expect(FONT_CHARACTERS.has("\u0000")).toBe(false);
    expect(FONT_CHARACTERS.size).toBe(26 + 3 + 31 + 5);
  });

  it("is case-insensitive, including the accented row", () => {
    expect(fontCharacter("A")).toEqual(fontCharacter("a"));
    expect(fontCharacter("Å")).toEqual(fontCharacter("å"));
    expect(fontCharacter("å")).toEqual({ x: 0, y: 12, width: 5, height: 6 });
  });

  it("draws angle and curly brackets out of the square brackets' cells", () => {
    // The font has neither, so all four borrow. Without the aliases they are
    // misses, and a miss is a gap in somebody's track title that nobody
    // reports as a bug.
    expect(fontCharacter("<")).toEqual(fontCharacter("["));
    expect(fontCharacter("{")).toEqual(fontCharacter("["));
    expect(fontCharacter(">")).toEqual(fontCharacter("]"));
    expect(fontCharacter("}")).toEqual(fontCharacter("]"));
  });

  it("folds an accent the font has no cell for", () => {
    // The hub's fallback language is Spanish and this font has no n-with-tilde.
    // Folding draws an `n`; not folding draws a hole mid-word.
    expect(fontCharacter("ñ")).toEqual(fontCharacter("n"));
    expect(fontCharacter("é")).toEqual(fontCharacter("e"));
    expect(fontCharacter("Ó")).toEqual(fontCharacter("o"));
  });

  it("does not fold the three vowels that have their own cells", () => {
    // Exact-first, or the Swedish row is unreachable — every one of them would
    // land on a bare vowel and the accented cells would never be drawn.
    expect(fontCharacter("å")).not.toEqual(fontCharacter("a"));
    expect(fontCharacter("ö")).not.toEqual(fontCharacter("o"));
    expect(fontCharacter("ä")).not.toEqual(fontCharacter("a"));
  });

  it("answers undefined for a character with no cell at all", () => {
    expect(fontCharacter("あ")).toBeUndefined();
    expect(fontCharacter("🦊")).toBeUndefined();
  });

  it("has no duplicate sprite names across sheets", () => {
    // A duplicate would make `spriteSheet` answer one sheet while a renderer
    // drew from the other, which is invisible until a skin omits one of them.
    const total = SKIN_SHEETS.reduce(
      (sum, sheet) =>
        sum +
        [...SKIN_SPRITES.keys()].filter((name) => spriteSheet(name) === sheet)
          .length,
      0,
    );
    expect(total).toBe(SKIN_SPRITES.size);
  });
});
```

- [ ] **Step 4: Run the tests**

```bash
cd apps/hub && npx vitest run tests/skin-sprites.test.ts
```

Expected: PASS. If `FONT_CHARACTERS.get("z")` is not `x: 125`, the `FONT_ROWS`
first row is the wrong length — count it rather than adjusting the assertion.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/domain/skin-sprites.ts apps/hub/tests/skin-sprites.test.ts
git commit -m "feat(actors): the classic skin sprite atlas"
```

---

### Task 3: Gates

- [ ] **Step 1: Coverage**

```bash
cd apps/hub && npx vitest run --coverage --coverage.reporter=text \
  tests/wsz.test.ts tests/skin-sprites.test.ts
```

Both modules must be at 100% branch coverage. **Use `text`, not
`text-summary`** — rule 11: the summary reports a percentage and never names
the uncovered line, which is how a missed branch stayed invisible for weeks.

- [ ] **Step 2: The whole suite, lint, types, docs**

```bash
cd Z:/Github/aeleos
pnpm --filter hub test
pnpm lint
pnpm typecheck
pnpm check:docs
npx cspell "apps/hub/src/features/actors/domain/*.ts" "apps/hub/tests/*.test.ts" --no-progress
```

`cspell` will want words such as `cbuttons`, `shufrep`, `pledit`, `posbar`,
`monoster`, `playpaus`, `wsz`, `eocd`. Add them to `cspell.json` in the same
commit rather than suppressing them.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: gates green for the skin engine"
```

---

## Self-Review

- **Spec coverage.** This plan implements spec §5's two modules and closes §9's
  `Blob` constraint. It does not touch §4 (the model), §6 (playback), §7 (the
  probe), §8 (skin sources) or §12 (scaling) — those are phases 2 and later,
  and none of them is reachable without this.
- **Placeholders.** None. The one generated block has its generator, its
  expected output line, and the assertions that prove it landed.
- **Type consistency.** `readSkinArchive` produces
  `ReadonlyMap<string, Uint8Array>` keyed by lowercased basename;
  `SKIN_SHEETS` holds exactly those keys and the first test asserts the
  convention on this side. Phase 3 joins them.

## What phase 2 does next

The model and the database: two leaf kinds, `playlist`, the three skin fields,
`0009` and its hand-application to the live project.
