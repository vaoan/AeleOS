# Hub launch, Part A — launch fixes — Implementation Plan

<!-- cspell:words Copiado Copiar Correo Crea Código Detalles Editar Elige Entrar Enviar Enviarme Inténtalo Miembro Revísalo Usar ambar básico correo código enviamos esperando está falló inténtalo línea momento nombre nuevo otra otro perfil ponle técnicos Ámbar ámbar — Spanish interface copy quoted verbatim -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every launch bug the 2026-09-29 review found — the empty side panel, sign-in that does not match production, the wrong avatar initial, the bare `/me`, the discouraging empty `/pages`, and "Lo basico" — as one PR.

**Architecture:** Each fix lands at the layer its fault lived: the panel in `block-editor.tsx`'s selection-to-panel wiring, the initial as one pure domain function shared by every avatar, sign-in as a new email-code form beside the existing provider buttons on Clerk's v7 signal API, `/me` and `/pages` as presentation changes over reads that already exist. No migration, no new route.

**Tech Stack:** Next.js 16 (read `apps/hub/node_modules/next/dist/docs/` before touching routing or metadata), React 19, `@clerk/nextjs` 7.7.1 (`@clerk/shared` 4.27.1 types), next-intl 4, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-29-hub-launch-polish-design.md` — §2 decisions, §3 invariants, §4 Part A. This plan is Part A only; Parts B–E get their own plans, each written after the part before it merges, because each depends on facts only true then.

## Global Constraints

- The hub's public host is `me.furrycolombia.com`; nothing names the apex `furrycolombia.com`.
- $0: no paid service; no new runtime dependency in this part.
- Every string a person reads is in `apps/hub/src/shared/infrastructure/i18n/messages/es.json` and `en.json`; Spanish is written first, Colombian, _tú_.
- Every export carries TSDoc stating its contract; `pnpm check:docs` fails when code moves and TSDoc does not.
- Every non-presentation `.ts` under `apps/hub/src` is held to 100% branch, function, line and statement coverage (`apps/hub/vitest.config.ts:145-150`); `src/app/**` and `src/features/*/presentation/**/*.tsx` are excluded, so those are proved in the browser.
- Every bug fixed here gets a regression test, sabotage-verified with `/sabotage-verify` (put the original fault back, watch the test go red, restore exactly).
- Zero flakiness: no retries, no widened timeouts, no `test.skip` to get green.
- A person's machine handle (`u-` + 32 hex, `isMachineHandle` in `apps/hub/src/features/actors/domain/actor-content.ts`) is never rendered, not even its first letter.
- Never touch the development Clerk instance's settings: it is shared with Libra. Email code is already on there and in production (checked 2026-09-29 through each instance's `/v1/environment`); Facebook stays enabled on development for Libra and simply leaves the hub's UI.
- Never run anything against Libra's database.
- Run every command from the repository root. e2e: `set -a; . ./.secrets; set +a` first, then `pnpm --filter hub test:e2e`; read the summary line, not the exit code.
- Commits: identity from `docs/git-with-gh-token.md`, message ends `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The pre-commit hook runs `check:docs` and `check:agent-notes` with `--staged`; when it names a note, re-read it and write a sentence that carries information, never a "re-read on" line.

## Review Focus

1. **A brand-new person signing in by email.** No Clerk user exists for that address; sign-in must fall through to sign-up and still land on `/me`, provisioned. Owned by Task 4, pinned by its e2e case with an address never created through the backend.
2. **A wrong or expired code, and resending.** A typo must say so in place and keep the email; "Send a new code" must work without retyping the address. Task 4, unit cases.
3. **Names that do not start with an ASCII letter.** "Ámbar" → "Á", "🦊 Ember" → "🦊", " luna" → "L", "" and whitespace-only → no initial at all (a neutral glyph, never a blank disc and never the machine handle). Task 2, unit cases.
4. **Deselecting from a non-Page tab.** A person on Appearance for a leaf who presses Escape must land on the Page form, not on a hidden Theme pane or an empty region. Task 1, unit case.
5. **A person who owns fursonas but filters to nothing.** The invitation card must not replace "Nothing matches that"; search and pills must stay. Task 5, unit case.

---

### Task 1: The side panel never renders empty

**The fault, diagnosed 2026-09-29:** the tab state starts at `"primary"` (`apps/hub/src/features/actors/presentation/block-editor.tsx:1590`) and no deselect path changes it. With nothing selected `panelContentFor` returns `primary: null` (`:1062`), `PropertiesPanel` hides the Page/Theme buttons (`properties-panel.tsx:205,216`) and the Palette pane is `null` until first opened (`block-editor.tsx:2492`). Result: no tab selected, blank panel. The 2026-09-05 palette spec's table mapped "Nothing" to Palette but never chose the active tab; the launch spec §4.1 now requires the Page form whenever nothing is selected.

**Fix:** the panel treats "nothing selected" as "the page is selected". The canvas keeps the real selection (no outline appears on the page), so only what the panel shows changes.

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/block-editor.tsx` (`:312-317` TSDoc, `:930-932` TSDoc, `:2105`, `:2151`, `:2429-2430`, `:2483`, `:2490`)
- Modify: `apps/hub/src/features/actors/presentation/properties-panel.tsx:53-58` (TSDoc of `selection`)
- Modify: `apps/hub/tests/block-editor.test.tsx` (`:700-717`, `:1036-1054`, `:1063-1081`, `:1083-1108`, and every other `panel-tab-primary` … `hidden` assertion listed by `grep -n 'panel-tab-primary' apps/hub/tests/block-editor.test.tsx`)
- Modify: `apps/hub/tests/e2e/properties-panel.spec.ts:58-` ("the panel starts closed…")
- Modify: `apps/hub/tests/e2e/support/editor.ts:54-64` (`selectPage`)
- Test: `apps/hub/tests/e2e/properties-panel.spec.ts` (new case)
- Docs: `docs/superpowers/specs/2026-09-05-palette-drag-to-add-design.md` (dated marker on its selection table), `apps/hub/src/features/actors/HISTORY.md` (new dated section), `.claude/rules/editor-presentation.md` (one rule line)

**Interfaces:**

- Consumes: `EditorSelection` (`domain/editor-selection.ts`), `PropertiesActiveTab`.
- Produces: nothing new; `PropertiesPanel` keeps its props. From now on `BlockEditor` never passes it `selection={null}`.

- [ ] **Step 1: Write the failing unit tests**

In `apps/hub/tests/block-editor.test.tsx`, add a helper near `harness` and replace the test at `:708`:

```tsx
/**
 * Asserts the panel is showing the Page form as its fallback: the primary tab
 * is visible, selected, and labelled Page.
 */
function expectPageFallback() {
  const primary = screen.getByTestId("panel-tab-primary");
  expect(primary).not.toHaveAttribute("hidden");
  expect(primary).toHaveAttribute("aria-selected", "true");
  expect(primary).toHaveTextContent("Page");
}

it("starts deselected, with the Page form showing rather than an empty panel", () => {
  harness(recursivePage());
  expect(screen.getByTestId("properties-panel")).toBeInTheDocument();
  expectPageFallback();
  expect(screen.getByTestId("panel-tab-palette")).not.toHaveAttribute("hidden");
});

it("lands on the Page form when a leaf on its Appearance tab is deselected with Escape", async () => {
  harness(recursivePage());
  selectPath("0-0-0");
  fireEvent.click(screen.getByTestId("panel-tab-secondary"));
  fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
  await settle();
  expect(screen.queryByTestId("leaf-editor")).toBeNull();
  expectPageFallback();
});
```

Every existing assertion `expect(screen.getByTestId("panel-tab-primary")).toHaveAttribute("hidden")` that proves a DESELECT becomes `expectPageFallback()`, and where the test's point is that a selection was cleared, it additionally asserts that selection's own content is gone (`expect(screen.queryByTestId("leaf-editor")).toBeNull()` for a leaf; for a container, the container editor's own test id). The test at `:1036` ("still clears the selection for a click on the page itself") starts from a LEAF, since a cleared Page selection and the Page fallback now look alike in the panel:

```tsx
it("still clears the selection for a click on the page itself", () => {
  harness(recursivePage());
  selectPath("0-0-0");
  expect(screen.getByTestId("leaf-editor")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("editor-canvas"));
  expect(screen.queryByTestId("leaf-editor")).toBeNull();
  expectPageFallback();
});
```

In the `it.each` at `:1083` ("closes the panel directly from %s"), replace the `hidden` assertion with `expectPageFallback()`; for the "a leaf" and "a container" rows also assert their editor is gone. Rewrite the comments above each changed assertion so they describe the fallback. A comment that still says "the selection-dependent tab going `hidden`" is now false.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter hub test -- block-editor`
Expected: FAIL. The new cases and every rewritten deselect case fail on `not.toHaveAttribute("hidden")` or `aria-selected`.

- [ ] **Step 3: Implement**

In `block-editor.tsx`, next to where `currentSelection` is derived (just above the `panelContentFor({` call at `:2425`):

```tsx
// **The panel never shows "nothing" (2026-09-29).** With nothing selected
// it shows the Page form, the first thing a new page needs; the canvas
// keeps the real selection, so no outline appears around the page.
const panelSelection: EditorSelection = currentSelection ?? { kind: "page" };
```

Pass `currentSelection: panelSelection` to `panelContentFor` (`:2430`) and `selection={panelSelection}` to `<PropertiesPanel>` (`:2483`). Leave every other use of `currentSelection` alone: the canvas outline, `panelFoot`, `deleteSelected` and drag all need the real selection.

In each deselect path, reset the tab too, so a deselect from Theme, Appearance or Layout lands on the Page form:

- Escape handler (`:2105`): replace `setSelection(null);` with `setSelection(null);` followed by `setTab("primary");`, and add `setTab` to that effect's dependency array.
- Empty-canvas click (`:2151`): the same two lines.
- `onClose` (`:2490`): `onClose={() => { setSelection(null); setTab("primary"); }}`.

Rewrite the TSDoc at `:312-317` so it says the panel shows the Page form when nothing is selected, and why. Rewrite the `@returns` at `:930-932` so it no longer says "the panel renders nothing without a selection". Rewrite `properties-panel.tsx:53-58` so it says `null` is still accepted by this component, but `BlockEditor` never passes it since 2026-09-29.

- [ ] **Step 4: Run the unit tests**

Run: `pnpm --filter hub test -- block-editor properties-panel`
Expected: PASS.

- [ ] **Step 5: Write the browser regression test and fix the helper**

`selectPage` in `apps/hub/tests/e2e/support/editor.ts:54-64` treats a visible primary tab as "something is selected" and waits for it to hide after Close, which is no longer true. Make it select the Page explicitly and wait for the Page form:

```ts
export async function selectPage(page: Page): Promise<void> {
  await page.getByTestId("select-page").click();
  await expect(page.getByTestId("panel-tab-primary")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("editor-handle")).toBeVisible();
}
```

Keep its TSDoc accurate. In `properties-panel.spec.ts`, rewrite "the panel starts closed…" (`:58`) to assert the fallback. Then add the regression case beside "Escape clears the selection…" (`:149`), reusing that file's `identity` and imports:

```ts
test("a new page never shows an empty panel, on arrival or after Escape", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/pages/new");
  const primary = page.getByTestId("panel-tab-primary");
  await expect(primary).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("editor-handle")).toBeVisible();

  await page.getByTestId("select-page").click();
  await page.keyboard.press("Escape");
  await expect(primary).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("editor-handle")).toBeVisible();
});
```

Run: `set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e -- properties-panel palette-drag-to-add editor-interaction`
Expected: every case passes. Read the summary line. Then `grep -rln "panel-tab-primary" apps/hub/tests/e2e` and run every file it lists; any file still asserting `hidden` after a deselect gets the same treatment.

- [ ] **Step 6: Sabotage-verify**

Invoke `/sabotage-verify`: temporarily change `panelSelection` back to `currentSelection` in both places. The new unit cases and the new e2e case must fail. Restore exactly, and confirm with `git diff` that only the intended changes remain.

- [ ] **Step 7: Move the documentation**

- Append a dated bold marker to the "Nothing → Palette" row's explanation in `docs/superpowers/specs/2026-09-05-palette-drag-to-add-design.md`: **2026-09-29: superseded by the launch spec §4.1. Nothing selected shows the Page form, and Palette stays one click away.**
- Add a section "The panel never shows nothing (2026-09-29)" at the end of `apps/hub/src/features/actors/HISTORY.md`, covering the fault, the diagnosis and the fix.
- Add one rule line to `.claude/rules/editor-presentation.md`: **With nothing selected the panel shows the Page form: `BlockEditor` passes `currentSelection ?? { kind: "page" }` to the panel only, and every deselect path resets the tab to `primary`.**

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src/features/actors/presentation/block-editor.tsx apps/hub/src/features/actors/presentation/properties-panel.tsx apps/hub/tests/block-editor.test.tsx apps/hub/tests/e2e/properties-panel.spec.ts apps/hub/tests/e2e/support/editor.ts docs/superpowers/specs/2026-09-05-palette-drag-to-add-design.md apps/hub/src/features/actors/HISTORY.md .claude/rules/editor-presentation.md
git commit -m "fix(actors): with nothing selected the panel shows the Page form, never an empty region"
```

---

### Task 2: One initial, from the name, never from a machine handle

**The fault:** `fursona-row.tsx:240` renders `actor.handle.slice(0, 1).toUpperCase()`. "Ember the Fox" with handle `review-fox` shows "R", and the person's own row shows "U" from the machine handle `u-<actor_ref>`, which is the first character of a value that must never be rendered.

**Files:**

- Modify: `apps/hub/src/features/actors/domain/actor-content.ts` (add `initialOf` after `isMachineHandle`)
- Modify: `apps/hub/src/features/actors/index.ts` (export `initialOf` beside `isMachineHandle`, `:56`)
- Create: `apps/hub/src/features/actors/presentation/member-avatar.tsx`
- Modify: `apps/hub/src/features/actors/presentation/fursona-row.tsx:229-242`
- Test: `apps/hub/tests/actor-content.test.ts`, `apps/hub/tests/fursona-row.test.tsx`

**Interfaces:**

- Produces: `initialOf(displayName: string | null, handle: string): string | null`, and `MemberAvatar({ src, displayName, handle, size }: MemberAvatarProps)` with `size: "sm" | "lg"` (`sm` = `size-10`, `lg` = `size-20`). Task 3 uses both; Part C will reuse `MemberAvatar` for the public avatar.

- [ ] **Step 1: Write the failing unit tests**

Append to `apps/hub/tests/actor-content.test.ts`, extending its existing import from `@/features/actors/domain/actor-content` with `initialOf`:

```ts
describe("initialOf", () => {
  it.each([
    ["Ember the Fox", "review-fox", "E"],
    ["ámbar", "ambar", "Á"],
    ["🦊 Ember", "ember", "🦊"],
    ["  luna", "luna", "L"],
    [null, "sparky", "S"],
    ["   ", "sparky", "S"],
    [null, "u-0123456789abcdef0123456789abcdef", null],
    ["", "u-0123456789abcdef0123456789abcdef", null],
  ])("initialOf(%j, %j) is %j", (name, handle, expected) => {
    expect(initialOf(name, handle)).toBe(expected);
  });
});
```

In `apps/hub/tests/fursona-row.test.tsx`, following that file's existing `render(<FursonaRow …/>)` setup and `labels`:

```tsx
it("draws the initial from the display name, not the handle", () => {
  renderRow({
    displayName: "Ember the Fox",
    handle: "review-fox",
    avatarUrl: null,
  });
  expect(screen.getByTestId("member-avatar")).toHaveTextContent("E");
});

it("never draws a letter of the person's machine handle", () => {
  renderRow({
    kind: "person",
    displayName: null,
    handle: "u-0123456789abcdef0123456789abcdef",
    avatarUrl: null,
  });
  expect(screen.getByTestId("member-avatar")).not.toHaveTextContent("U");
});
```

If the file has no `renderRow`, add one that spreads these overrides over the file's existing base actor and renders `FursonaRow` with its existing `labels`.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter hub test -- actor-content fursona-row`
Expected: FAIL: `initialOf` is not exported, and `member-avatar` is not found.

- [ ] **Step 3: Implement `initialOf`**

In `actor-content.ts`, directly after `isMachineHandle`:

```ts
/**
 * The one character an avatar shows when there is no picture.
 *
 * Taken from the display name first, then from a chosen handle, and never from
 * a machine handle. That handle is `actor_ref` in disguise (see
 * {@link isMachineHandle}), so even its first letter is not ours to show.
 * `null` tells the caller to draw a neutral glyph instead.
 *
 * The first grapheme is taken with `Intl.Segmenter`, not with `slice(0, 1)`.
 * That keeps an emoji or a combining accent in one piece, where `slice` would
 * cut a surrogate pair in half. The result is upper-cased in the root locale.
 *
 * @param displayName - what they chose to be called, or null.
 * @param handle - the handle as stored.
 * @returns one upper-cased grapheme, or null when nothing may be shown.
 */
export function initialOf(
  displayName: string | null,
  handle: string,
): string | null {
  const source =
    displayName?.trim() || (isMachineHandle(handle) ? "" : handle.trim());
  if (source === "") return null;
  const [first] = new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(source);
  return first!.segment.toLocaleUpperCase();
}
```

Export it from `apps/hub/src/features/actors/index.ts` in the same `export { … } from "@/features/actors/domain/actor-content"` block as `isMachineHandle`.

- [ ] **Step 4: Implement `MemberAvatar` and use it in the row**

Create `member-avatar.tsx`:

```tsx
import { PawPrint } from "lucide-react";
import { initialOf } from "@/features/actors/domain/actor-content";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link MemberAvatar} needs to draw a person or a fursona. */
export interface MemberAvatarProps {
  /** A pasted picture link, or null. */
  src: string | null;
  /** Their chosen name, or null. */
  displayName: string | null;
  /** The handle as stored; a machine handle is never shown. */
  handle: string;
  /** `sm` for list rows, `lg` for a profile card. */
  size: "sm" | "lg";
}

const SIZES = {
  sm: "size-10 text-sm",
  lg: "size-20 text-3xl",
} as const;

/**
 * An avatar: the picture when there is one. Without a picture, the name's
 * initial is drawn on the accent colour, and a paw is drawn when not even an
 * initial may be shown. Decorative (`alt=""`), because the name always
 * appears next to it.
 */
export function MemberAvatar({
  src,
  displayName,
  handle,
  size,
}: MemberAvatarProps) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- pasted links from any host; next/image would need every host allow-listed.
    return (
      <img
        src={src}
        alt=""
        {...tid("member-avatar")}
        className={`${SIZES[size]} rounded-full object-cover`}
      />
    );
  }
  const initial = initialOf(displayName, handle);
  return (
    <span
      aria-hidden="true"
      {...tid("member-avatar")}
      className={`${SIZES[size]} grid shrink-0 place-items-center rounded-full bg-(--accent)/15 font-display font-bold text-(--accent)`}
    >
      {initial ?? <PawPrint className="size-1/2" />}
    </span>
  );
}
```

Before relying on `bg-(--accent)/15`, confirm it compiles to a rule. Root rule 36 says a class that compiles to nothing looks exactly like one that works. Check how existing code tints with an alpha on a variable (`bg-(--edge)/40` is already used in `fursona-row.tsx:238`) and use the same form. In `fursona-row.tsx:229-242`, replace the whole `actor.avatarUrl ? … : …` expression with `<MemberAvatar src={actor.avatarUrl} displayName={actor.displayName} handle={actor.handle} size="sm" />`. If the old `<img>` had a test id that tests use, update those tests to `member-avatar`.

- [ ] **Step 5: Run the tests and check coverage**

Run: `pnpm --filter hub test -- actor-content fursona-row` → PASS. Then `pnpm --filter hub test:coverage` → the thresholds hold (every branch of `initialOf` is covered by the table).

- [ ] **Step 6: Sabotage-verify**

With `/sabotage-verify`, put `actor.handle.slice(0, 1).toUpperCase()` back as the avatar's text: the two row cases must fail. Then make `initialOf` ignore `isMachineHandle`: the two `null` rows must fail. Restore exactly each time.

- [ ] **Step 7: Commit**

```bash
git add apps/hub/src/features/actors/domain/actor-content.ts apps/hub/src/features/actors/index.ts apps/hub/src/features/actors/presentation/member-avatar.tsx apps/hub/src/features/actors/presentation/fursona-row.tsx apps/hub/tests/actor-content.test.ts apps/hub/tests/fursona-row.test.tsx
git commit -m "fix(actors): an avatar's initial comes from the name, and never from a machine handle"
```

---

### Task 3: `/me` becomes a profile card

**The fault:** `/me` (`apps/hub/src/app/[locale]/(app)/me/page.tsx`) shows no avatar, prints "Handle —" for every person (their handle is always the machine one), puts the raw platform ID up front, and has no link to `/me/edit`.

**Files:**

- Modify: `apps/hub/src/features/actors/domain/actor-content.ts` (add `memberNumberOf`)
- Modify: `apps/hub/src/features/actors/index.ts` (export `memberNumberOf`, `MemberAvatar`)
- Create: `apps/hub/src/shared/presentation/copy-link-button.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/me/page.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/es.json`, `en.json` (`profile` namespace)
- Test: `apps/hub/tests/actor-content.test.ts`, `apps/hub/tests/copy-link-button.test.tsx`, `apps/hub/tests/e2e/signed-in.spec.ts`

**Interfaces:**

- Consumes: `initialOf`, `MemberAvatar` (Task 2); `getPersonActor` → `PersonActor { displayName, avatarUrl, handle, … }`; `readMyAddress(client): Promise<string | undefined>`.
- Produces: `memberNumberOf(address: string | undefined): string | null`; `CopyLinkButton({ path, label, copiedLabel }: CopyLinkButtonProps)` (Part C reuses it on the share screen).

- [ ] **Step 1: Write the failing unit tests**

In `actor-content.test.ts`:

```ts
describe("memberNumberOf", () => {
  it.each([
    ["12576", "12576"],
    ["7", "7"],
    ["luna", null],
    ["7luna", null],
    [undefined, null],
  ])("memberNumberOf(%j) is %j", (address, expected) => {
    expect(memberNumberOf(address)).toBe(expected);
  });
});
```

Create `apps/hub/tests/copy-link-button.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CopyLinkButton } from "@/shared/presentation/copy-link-button";

describe("CopyLinkButton", () => {
  it("copies the absolute address and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <CopyLinkButton
        path="/es/12576"
        label="Copy link"
        copiedLabel="Copied"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/es/12576`);
    expect(screen.getByRole("button")).toHaveTextContent("Copied");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter hub test -- actor-content copy-link-button` → FAIL (neither export exists).

- [ ] **Step 3: Implement**

In `actor-content.ts`:

```ts
/**
 * The member number an address shows, when the address IS the number.
 *
 * Every person has one permanent sequential number (see the actors note,
 * "Person addresses"). Until the public reads return it as a separate column
 * (launch spec §6.3, Part C), the only number in hand is the canonical
 * address itself. That address is a vanity for the few people granted one,
 * and for them this returns null rather than guessing.
 *
 * @param address - the canonical address, or undefined when there is none.
 * @returns the decimal digits, or null when the address is not a number.
 */
export function memberNumberOf(address: string | undefined): string | null {
  return address !== undefined && /^[0-9]+$/.test(address) ? address : null;
}
```

Create `copy-link-button.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { tid } from "@/shared/infrastructure/test-id";

/** What {@link CopyLinkButton} copies and says. */
export interface CopyLinkButtonProps {
  /** A path on this origin, locale included, such as `/es/12576`. */
  path: string;
  /** The button's label before copying. */
  label: string;
  /** The label after a successful copy. */
  copiedLabel: string;
}

/**
 * Copies this origin's absolute address for `path`. The origin is read in the
 * browser, so the button copies `me.furrycolombia.com` in production and
 * `localhost` in development without being told which it is running on.
 */
export function CopyLinkButton({
  path,
  label,
  copiedLabel,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      {...tid("copy-link")}
      onClick={async () => {
        await navigator.clipboard.writeText(`${location.origin}${path}`);
        setCopied(true);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg surface px-3 py-1.5 text-sm"
    >
      {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
      {copied ? copiedLabel : label}
    </button>
  );
}
```

Add to both catalogues under `profile`. Remove `handle` and `empty` only after `grep -rn '"profile"' apps/hub/src` and a search for `t("handle")` and `t("empty")` show nothing else uses them.

- es: `"member": "Miembro #{number}"`, `"editProfile": "Editar perfil"`, `"copyLink": "Copiar enlace"`, `"copied": "Copiado"`, `"technical": "Detalles técnicos"`
- en: `"member": "Member #{number}"`, `"editProfile": "Edit profile"`, `"copyLink": "Copy link"`, `"copied": "Copied"`, `"technical": "Technical details"`

Rewrite the page's JSX as follows. Keep the data reads exactly as they are, and import `MemberAvatar` and `memberNumberOf` from `@/features/actors` and `CopyLinkButton` from `@/shared/presentation/copy-link-button`:

```tsx
const name = actor?.displayName ?? user?.firstName ?? t("fallbackTitle");
const number = memberNumberOf(address);
return (
  <WidePageColumn>
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-[620px]">
        <Card>
          <div className="flex items-center gap-5">
            <MemberAvatar
              src={actor?.avatarUrl ?? null}
              displayName={actor?.displayName ?? user?.firstName ?? null}
              handle={actor?.handle ?? ""}
              size="lg"
            />
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                {name}
              </h1>
              {number ? (
                <p
                  {...tid("member-badge")}
                  className="mt-1 inline-flex rounded-full bg-(--accent)/15 px-2.5 py-0.5 text-sm font-medium text-(--accent)"
                >
                  {t("member", { number })}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/me/edit"
              {...tid("edit-profile")}
              className="rounded-lg bg-(--accent) px-4 py-1.5 text-sm font-medium text-(--on-accent)"
            >
              {t("editProfile")}
            </Link>
            {address ? (
              <CopyLinkButton
                path={`/${locale}/${address}`}
                label={t("copyLink")}
                copiedLabel={t("copied")}
              />
            ) : null}
          </div>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-(--muted)">{t("address")}</dt>
            <dd {...tid("my-address")}>
              {address ? (
                <Link
                  href={`/${address}`}
                  {...tid("my-profile-link")}
                  className="font-mono underline underline-offset-4"
                >
                  {address}
                </Link>
              ) : (
                t("addressEmpty")
              )}
            </dd>
          </dl>
          <p className="mt-4 text-sm text-(--muted)">{t("addressHint")}</p>
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-(--muted)">
              {t("technical")}
            </summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
              <dt className="text-(--muted)">{t("platformId")}</dt>
              <dd
                className="font-mono text-xs break-all"
                {...tid("my-platform-id")}
              >
                {actorRef}
              </dd>
            </dl>
            <p className="mt-2 text-(--muted)">{t("platformIdHint")}</p>
          </details>
          <div className="mt-8 border-t border-(--edge)/40 pt-6">
            <Link
              href="/pages"
              className="block text-sm font-medium text-(--accent)"
            >
              {t("pagesLink")}
            </Link>
            <div className="mt-4">
              <SignOutControl label={t("signOut")} redirectUrl={`/${locale}`} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </WidePageColumn>
);
```

Keep the page's existing long comments, and adjust any that described the removed handle row. The `my-address`, `my-profile-link` and `my-platform-id` test ids stay, so `signed-in.spec.ts`, `editor-saves-page.spec.ts` and `nested-page-build.spec.ts` keep working. `my-platform-id` is now inside a closed `<details>`, so any spec that asserts it is **visible** must open the `summary` first. Check with `grep -rn "my-platform-id" apps/hub/tests`.

- [ ] **Step 4: Run the unit tests**

Run: `pnpm --filter hub test -- actor-content copy-link-button messages message-keys-exist` → PASS.

- [ ] **Step 5: Browser case**

In `apps/hub/tests/e2e/signed-in.spec.ts`, beside the existing `/es/me` cases and with that file's identity setup:

```ts
test("/me is a profile card: avatar, member badge, edit link, ID tucked away", async ({
  page,
}) => {
  await signIn(page, await mintTicket(identity!.userId));
  await page.goto("/es/me");
  await expect(page.getByTestId("member-avatar")).toBeVisible();
  await expect(page.getByTestId("member-badge")).toHaveText(/^Miembro #\d+$/);
  await expect(page.getByTestId("edit-profile")).toHaveAttribute(
    "href",
    "/es/me/edit",
  );
  await expect(page.getByTestId("my-platform-id")).toBeHidden();
  await page.getByText("Detalles técnicos").click();
  await expect(page.getByTestId("my-platform-id")).toBeVisible();
});
```

Run: `pnpm --filter hub test:e2e -- signed-in editor-saves-page nested-page-build` → all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/actor-content.ts apps/hub/src/features/actors/index.ts apps/hub/src/shared/presentation/copy-link-button.tsx "apps/hub/src/app/[locale]/(app)/me/page.tsx" apps/hub/src/shared/infrastructure/i18n/messages/es.json apps/hub/src/shared/infrastructure/i18n/messages/en.json apps/hub/tests/actor-content.test.ts apps/hub/tests/copy-link-button.test.tsx apps/hub/tests/e2e/signed-in.spec.ts
git commit -m "feat(me): the profile page shows who you are, your member number, and a way to edit"
```

---

### Task 4: Sign-in matches production: Discord, Google, email code

**The fault:** `PROVIDERS` (`apps/hub/src/features/session/infrastructure/providers.ts:46-50`) offers Facebook, which production does not have, and there is no way in by email, which production does offer (`docs/deployment.md:91-94,138`).

**Clerk API in this version** (verified in `@clerk/shared` 4.27.1 `dist/types/signInFuture.d.ts` and `signUpFuture.d.ts`):

- `signIn.emailCode.sendCode({ emailAddress })` and `signIn.emailCode.verifyCode({ code })`.
- `signUp.create({ emailAddress })`, `signUp.verifications.sendEmailCode()` and `signUp.verifications.verifyEmailCode({ code })`.
- `signIn.finalize()` and `signUp.finalize()`.

Every call **returns** `{ error }` rather than throwing, the same as `signIn.sso` already handled in `sign-in-form.tsx`.

**Files:**

- Create: `apps/hub/src/features/session/domain/clerk-error-code.ts`
- Create: `apps/hub/src/features/session/presentation/email-code-form.tsx`
- Modify: `apps/hub/src/features/session/infrastructure/providers.ts` (drop Facebook, fix its TSDoc at `:38-44`)
- Modify: `apps/hub/src/features/session/presentation/provider-marks.tsx` (delete `FacebookMark`, `:68-80`, and its comment at `:26`)
- Modify: `apps/hub/src/features/session/presentation/sign-in-form.tsx` (`MARKS`, `:17-21`; render `EmailCodeForm` below the buttons; TSDoc that says "the whole of sign-in is these buttons")
- Modify: `apps/hub/src/app/[locale]/sign-in/[[...sign-in]]/page.tsx` (pass the email labels)
- Modify: `es.json`, `en.json` (`signIn` namespace)
- Modify: `apps/hub/tests/sign-in-form.test.tsx`, `apps/hub/tests/e2e/auth.spec.ts` (`:53-60`, `:62-73`)
- Test: `apps/hub/tests/clerk-error-code.test.ts`, `apps/hub/tests/email-code-form.test.tsx`, `apps/hub/tests/e2e/auth.spec.ts`
- Docs: `docs/deployment.md` (the hub's buttons now match the launch set)

**Interfaces:**

- Produces: `clerkErrorCode(error: unknown): string | null`; `EmailCodeForm({ afterSignInUrl, labels }: EmailCodeFormProps)`, where `labels` is `EmailCodeLabels` with `{ email, send, code, verify, resend, change, wrongCode, unknownError, sentTo }`.

- [ ] **Step 1: Prove the error shape against the real instance**

Clerk returns an API error in one of two shapes, and which one decides how "no such account" is detected. Before writing the branch, write a scratch spec, `apps/hub/tests/e2e/zz-scratch-email-code.spec.ts`, that logs it:

```ts
import { test } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
test("log the unknown-account error shape", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/es/sign-in");
  const shape = await page.evaluate(async () => {
    const clerk = (window as any).Clerk;
    await clerk.load();
    try {
      await clerk.client.signIn.create({
        identifier: `nobody-${Date.now()}+clerk_test@example.com`,
      });
      return "no error";
    } catch (e: any) {
      return JSON.stringify({
        code: e.code,
        first: e.errors?.[0]?.code,
        name: e.name,
      });
    }
  });
  console.log("SHAPE", shape);
});
```

Run: `pnpm --filter hub test:e2e -- zz-scratch-email-code`
Expected: `SHAPE {"first":"form_identifier_not_found",…}`. Record the exact output in the commit message of Step 9. **If `first` is anything other than `form_identifier_not_found`, use the value you saw in Step 3's `UNKNOWN_ACCOUNT` and in the unit test.** Delete the scratch spec afterwards; it is never committed.

- [ ] **Step 2: Write the failing unit tests**

`apps/hub/tests/clerk-error-code.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { clerkErrorCode } from "@/features/session/domain/clerk-error-code";

describe("clerkErrorCode", () => {
  it("reads the first API error's code", () => {
    expect(
      clerkErrorCode({ errors: [{ code: "form_identifier_not_found" }] }),
    ).toBe("form_identifier_not_found");
  });
  it("falls back to the error's own code", () => {
    expect(clerkErrorCode({ code: "form_code_incorrect" })).toBe(
      "form_code_incorrect",
    );
  });
  it.each([null, undefined, "boom", 42, {}, { errors: [] }, { errors: [{}] }])(
    "is null for %j",
    (value) => {
      expect(clerkErrorCode(value)).toBeNull();
    },
  );
});
```

`apps/hub/tests/email-code-form.test.tsx` mocks both hooks in the same way `sign-in-form.test.tsx:7-9` mocks `useSignIn`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const signIn = {
  emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
  finalize: vi.fn(),
  status: "needs_first_factor",
};
const signUp = {
  create: vi.fn(),
  verifications: { sendEmailCode: vi.fn(), verifyEmailCode: vi.fn() },
  finalize: vi.fn(),
  status: "missing_requirements",
};
vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn, fetchStatus: "idle", errors: null }),
  useSignUp: () => ({ signUp, fetchStatus: "idle", errors: null }),
}));
const assign = vi.fn();
vi.stubGlobal("location", { ...location, assign });

const { EmailCodeForm } =
  await import("@/features/session/presentation/email-code-form");
const labels = {
  email: "Email",
  send: "Send code",
  code: "Code",
  verify: "Sign in",
  resend: "Send a new code",
  change: "Use another email",
  wrongCode: "That code is not right",
  unknownError: "Something failed",
  sentTo: "Sent to {email}",
};
const ok = { error: null };

async function submitEmail(email = "luna@example.com") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  });
}
async function submitCode(code = "424242") {
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  signIn.status = "needs_first_factor";
  signUp.status = "missing_requirements";
});

describe("EmailCodeForm", () => {
  it("signs an existing person in with a code", async () => {
    signIn.emailCode.sendCode.mockResolvedValue(ok);
    signIn.emailCode.verifyCode.mockImplementation(async () => {
      signIn.status = "complete";
      return ok;
    });
    signIn.finalize.mockResolvedValue(ok);
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail();
    expect(signIn.emailCode.sendCode).toHaveBeenCalledWith({
      emailAddress: "luna@example.com",
    });
    await submitCode();
    expect(signIn.emailCode.verifyCode).toHaveBeenCalledWith({
      code: "424242",
    });
    expect(signIn.finalize).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/es/me");
  });

  it("signs a brand-new person up when no account has that email", async () => {
    signIn.emailCode.sendCode.mockResolvedValue({
      error: { errors: [{ code: "form_identifier_not_found" }] },
    });
    signUp.create.mockResolvedValue(ok);
    signUp.verifications.sendEmailCode.mockResolvedValue(ok);
    signUp.verifications.verifyEmailCode.mockImplementation(async () => {
      signUp.status = "complete";
      return ok;
    });
    signUp.finalize.mockResolvedValue(ok);
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail("new@example.com");
    expect(signUp.create).toHaveBeenCalledWith({
      emailAddress: "new@example.com",
    });
    expect(signUp.verifications.sendEmailCode).toHaveBeenCalled();
    await submitCode();
    expect(signUp.verifications.verifyEmailCode).toHaveBeenCalledWith({
      code: "424242",
    });
    expect(signUp.finalize).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("/es/me");
  });

  it("says a wrong code is wrong, keeps the email, and lets the person try again", async () => {
    signIn.emailCode.sendCode.mockResolvedValue(ok);
    signIn.emailCode.verifyCode.mockResolvedValue({
      error: { errors: [{ code: "form_code_incorrect" }] },
    });
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail();
    await submitCode("000000");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That code is not right",
    );
    expect(screen.getByText("Sent to luna@example.com")).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("resends a code without retyping the email", async () => {
    signIn.emailCode.sendCode.mockResolvedValue(ok);
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send a new code" }));
    });
    expect(signIn.emailCode.sendCode).toHaveBeenCalledTimes(2);
    expect(signIn.emailCode.sendCode).toHaveBeenLastCalledWith({
      emailAddress: "luna@example.com",
    });
  });

  it("goes back to the email step on request", async () => {
    signIn.emailCode.sendCode.mockResolvedValue(ok);
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail();
    fireEvent.click(screen.getByRole("button", { name: "Use another email" }));
    expect(screen.getByLabelText("Email")).toHaveValue("luna@example.com");
  });

  it("shows a general error when sending fails for another reason", async () => {
    signIn.emailCode.sendCode.mockResolvedValue({
      error: { errors: [{ code: "too_many_requests" }] },
    });
    render(<EmailCodeForm afterSignInUrl="/es/me" labels={labels} />);
    await submitEmail();
    expect(screen.getByRole("alert")).toHaveTextContent("Something failed");
    expect(signUp.create).not.toHaveBeenCalled();
  });
});
```

In `sign-in-form.test.tsx`, change `:41-46` to assert only `sign-in-discord` and `sign-in-google`, and add `expect(screen.queryByTestId("sign-in-facebook")).toBeNull();`. Add `useSignUp` to its `@clerk/nextjs` mock, since the form now renders `EmailCodeForm`, and pass `emailLabels` and `orLabel` in its props. At `:50-54`, where `getAllByRole("button")[0]` is checked, keep asserting that Discord is first.

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm --filter hub test -- clerk-error-code email-code-form sign-in-form` → FAIL.

- [ ] **Step 4: Implement `clerkErrorCode`**

```ts
/**
 * The machine code of a Clerk failure, in either of the two shapes Clerk
 * returns. An API response error carries `errors[0].code`
 * (`form_identifier_not_found`, `form_code_incorrect`, …); a client-side
 * `ClerkError` carries `code` itself. The API shape wins when both are
 * present, since it is the more specific one.
 *
 * @param error - whatever a Clerk call returned as `error`.
 * @returns the code, or null when there is none to read.
 */
export function clerkErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const { errors, code } = error as {
    errors?: Array<{ code?: unknown }>;
    code?: unknown;
  };
  const first = errors?.[0]?.code;
  if (typeof first === "string") return first;
  return typeof code === "string" ? code : null;
}
```

- [ ] **Step 5: Implement `EmailCodeForm`**

```tsx
"use client";

import { useState } from "react";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { clerkErrorCode } from "@/features/session/domain/clerk-error-code";
import { tid } from "@/shared/infrastructure/test-id";

const UNKNOWN_ACCOUNT = "form_identifier_not_found";
const WRONG_CODE = new Set([
  "form_code_incorrect",
  "verification_failed",
  "verification_expired",
]);

/** Already-translated strings for {@link EmailCodeForm}. */
export interface EmailCodeLabels {
  email: string;
  send: string;
  code: string;
  verify: string;
  resend: string;
  change: string;
  wrongCode: string;
  unknownError: string;
  /** Contains `{email}`, replaced with the address the code went to. */
  sentTo: string;
}

/** What {@link EmailCodeForm} needs. */
export interface EmailCodeFormProps {
  /** Where to land once the session exists, locale-prefixed. */
  afterSignInUrl: string;
  labels: EmailCodeLabels;
}

/**
 * Sign-in by a code sent to an email address, for a person who has an account
 * and for one who does not.
 *
 * **One form for both, because the person cannot know which they are.** It
 * tries sign-in first. When Clerk answers `form_identifier_not_found`, the
 * same email becomes a sign-up and the same code step follows, so a first
 * visit and a return visit look identical.
 *
 * Every Clerk call here RETURNS its error rather than throwing, as
 * `signIn.sso` does in `sign-in-form.tsx`. Each result is checked.
 *
 * It ends with a full navigation (`location.assign`) rather than a router
 * push, so the server components of the page it lands on read the session
 * cookie `finalize` just set.
 */
export function EmailCodeForm({ afterSignInUrl, labels }: EmailCodeFormProps) {
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<"email" | "code">("email");
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setFailure(null);
    const sent = await signIn.emailCode.sendCode({ emailAddress: email });
    if (!sent.error) {
      setMode("signIn");
      setStep("code");
    } else if (clerkErrorCode(sent.error) === UNKNOWN_ACCOUNT) {
      const created = await signUp.create({ emailAddress: email });
      const mailed = created.error
        ? created
        : await signUp.verifications.sendEmailCode();
      if (mailed.error) {
        setFailure(labels.unknownError);
      } else {
        setMode("signUp");
        setStep("code");
      }
    } else {
      setFailure(labels.unknownError);
    }
    setBusy(false);
  }

  async function verify() {
    setBusy(true);
    setFailure(null);
    const flow = mode === "signIn" ? signIn : signUp;
    const checked =
      mode === "signIn"
        ? await signIn.emailCode.verifyCode({ code })
        : await signUp.verifications.verifyEmailCode({ code });
    if (checked.error || flow.status !== "complete") {
      const wrong = WRONG_CODE.has(clerkErrorCode(checked.error) ?? "");
      setFailure(wrong ? labels.wrongCode : labels.unknownError);
      setBusy(false);
      return;
    }
    const done = await flow.finalize();
    if (done.error) {
      setFailure(labels.unknownError);
      setBusy(false);
      return;
    }
    location.assign(afterSignInUrl);
  }

  const field = "w-full rounded-lg surface bg-(--menu) px-3 py-2 text-base";
  const primary =
    "w-full rounded-lg bg-(--accent) px-4 py-2.5 font-medium text-(--on-accent) disabled:opacity-60";
  const quiet = "text-sm text-(--accent) underline-offset-4 hover:underline";

  return (
    <form
      {...tid("email-code-form")}
      className="mt-4 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (step === "email" ? send() : verify());
      }}
    >
      {step === "email" ? (
        <>
          <label className="grid gap-1 text-sm">
            {labels.email}
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              {...tid("sign-in-email")}
              className={field}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            {labels.send}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-(--muted)">
            {labels.sentTo.replace("{email}", email)}
          </p>
          <label className="grid gap-1 text-sm">
            {labels.code}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              {...tid("sign-in-code")}
              className={`${field} font-mono tracking-[0.3em]`}
            />
          </label>
          <button type="submit" disabled={busy} className={primary}>
            {labels.verify}
          </button>
          <div className="flex flex-wrap justify-between gap-2">
            <button
              type="button"
              className={quiet}
              disabled={busy}
              onClick={() => {
                void (mode === "signIn"
                  ? signIn.emailCode.sendCode({ emailAddress: email })
                  : signUp.verifications.sendEmailCode());
              }}
            >
              {labels.resend}
            </button>
            <button
              type="button"
              className={quiet}
              onClick={() => {
                setStep("email");
                setCode("");
                setFailure(null);
              }}
            >
              {labels.change}
            </button>
          </div>
        </>
      )}
      {failure ? (
        <p
          role="alert"
          {...tid("sign-in-code-error")}
          className="text-sm text-(--accent)"
        >
          {failure}
        </p>
      ) : null}
    </form>
  );
}
```

Two cautions:

- The resend handler ignores the returned error on purpose: a failed resend still leaves a usable code step. Say so in a one-line comment on that `onClick`.
- `labels.sentTo` is the raw template: the page passes `t.raw("sentTo")`, since the email is only known in the browser, and this component fills in `{email}`. The unit test's `"Sent to {email}"` is that same raw form.

- [ ] **Step 6: Wire it in and drop Facebook**

- `providers.ts`: change `id: "discord" | "google"` and remove the Facebook entry. Rewrite the TSDoc at `:38-44` to say the list is the production launch set, pointing to `docs/deployment.md` §1.
- `provider-marks.tsx`: delete `FacebookMark` and its comment.
- `sign-in-form.tsx`: remove the Facebook entry from `MARKS` and add `emailLabels: EmailCodeLabels` and `orLabel: string` to `SignInFormProps`. Below the provider button list, render a divider (`<p className="my-4 text-center text-xs text-(--muted)">{orLabel}</p>`) followed by `<EmailCodeForm afterSignInUrl={afterSignInUrl} labels={emailLabels} />`. Rewrite the TSDoc sentences that say there is no email field and that "the whole of sign-in is these buttons".
- `page.tsx`: build `emailLabels` with `t(key)` for each key except `sentTo`, which uses `t.raw("sentTo")`. Pass it, along with `orLabel={t("or")}`.

Catalogues, `signIn` namespace, Spanish first:

- es:
  - `"subtitle": "Entra con Discord, Google o tu correo."`
  - `"or": "o con tu correo"`
  - `"email": "Correo"`
  - `"send": "Enviarme un código"`
  - `"code": "Código"`
  - `"verify": "Entrar"`
  - `"resend": "Enviar otro código"`
  - `"change": "Usar otro correo"`
  - `"wrongCode": "Ese código no es. Revísalo e inténtalo otra vez."`
  - `"unknownError": "Algo falló. Inténtalo de nuevo en un momento."`
  - `"sentTo": "Te enviamos un código a {email}."`
- en:
  - `"subtitle": "Continue with Discord, Google or your email."`
  - `"or": "or with your email"`
  - `"email": "Email"`
  - `"send": "Send me a code"`
  - `"code": "Code"`
  - `"verify": "Sign in"`
  - `"resend": "Send a new code"`
  - `"change": "Use another email"`
  - `"wrongCode": "That code isn't right. Check it and try again."`
  - `"unknownError": "Something went wrong. Try again in a moment."`
  - `"sentTo": "We sent a code to {email}."`

- [ ] **Step 7: Run the unit tests**

Run: `pnpm --filter hub test -- clerk-error-code email-code-form sign-in-form sign-in-page messages message-keys-exist` → PASS. Then run `pnpm --filter hub test:coverage` and confirm `clerk-error-code.ts` is at 100%.

- [ ] **Step 8: Browser cases, against the real development instance**

In `apps/hub/tests/e2e/auth.spec.ts`:

- Change `:57` to `["discord", "google"]` and add `await expect(page.getByTestId("sign-in-facebook")).toHaveCount(0);`.
- Replace "the sign-in page offers no password or email path" (`:62-73`) with an assertion that no **password** field exists (`input[type="password"]` has count 0), and keep its comment's history: the email field is now deliberate (launch spec §4.2).
- Add the two real flows. Clerk's test mode accepts any `+clerk_test@example.com` address with the fixed code `424242`. Every user this creates must be deleted: the dev instance holds at most 100 users, shared with Libra.

```ts
test("an existing person signs in with an emailed code", async ({ page }) => {
  const known = await createTestIdentity();
  const email = await emailOf(known.userId);
  await setupClerkTestingToken({ page });
  await page.goto("/es/sign-in");
  await page.getByTestId("sign-in-email").fill(email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByTestId("sign-in-code").fill("424242");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/es\/me$/);
  await deleteTestIdentity(known.userId);
});

test("a brand-new person is signed up by the same form", async ({ page }) => {
  const email = `e2e-new-${Date.now()}+clerk_test@example.com`;
  await setupClerkTestingToken({ page });
  await page.goto("/es/sign-in");
  await page.getByTestId("sign-in-email").fill(email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  await page.getByTestId("sign-in-code").fill("424242");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/es\/me$/);
  await expect(page.getByTestId("my-address")).toBeVisible();
  const created = await userIdByEmail(email);
  registerTestIdentity(created);
  await deleteTestIdentity(created);
});
```

The existing `createTestIdentity` builds its address as `e2e-…+clerk_test@example.com`. Add two small helpers beside `createTestIdentity` in `tests/e2e/support/clerk-session.ts`, each with TSDoc, using that file's `backend()`:

- `emailOf(userId)`: `GET /users/{id}`, then `.email_addresses[0].email_address`.
- `userIdByEmail(email)`: `GET /users?email_address={encoded}`, then `[0].id`, throwing if it finds none.

Import `registerTestIdentity` from `./user-registry`, so the worker-scoped cleanup also catches the new user if the test fails before its own delete.

Run: `pnpm --filter hub test:e2e -- auth picker signed-in` → all pass. Then check the dashboard's user count has not grown: `GET /users/count` before and after, through `backend()` in a scratch `node` script, or read it from the run's cleanup log.

- [ ] **Step 9: Sabotage-verify and commit**

With `/sabotage-verify`:

- Change `UNKNOWN_ACCOUNT` to a wrong string: the brand-new-person unit case and e2e case must fail. Restore.
- Put Facebook back into `PROVIDERS`: the unit and e2e provider assertions must fail. Restore.

Update `docs/deployment.md` §1: the hub's sign-in now shows exactly the launch set (Discord, Google, email code), and Facebook left the hub's interface on 2026-09-29 while staying enabled on the shared development instance for Libra.

```bash
git add apps/hub/src/features/session apps/hub/src/app/[locale]/sign-in apps/hub/src/shared/infrastructure/i18n/messages/es.json apps/hub/src/shared/infrastructure/i18n/messages/en.json apps/hub/tests/clerk-error-code.test.ts apps/hub/tests/email-code-form.test.tsx apps/hub/tests/sign-in-form.test.tsx apps/hub/tests/e2e/auth.spec.ts apps/hub/tests/e2e/support/clerk-session.ts docs/deployment.md
git commit -m "feat(session): sign in with Discord, Google or an emailed code; Facebook leaves the hub"
```

Include Step 1's recorded `SHAPE` line in the commit body.

---

### Task 5: An empty `/pages` is an invitation

**The fault:** with no fursonas, `/pages` shows a search field and four filter pills with nothing to filter, then one grey line: "You have no fursonas yet." (`fursona-list.tsx:350-352`, `emptyNote` at `:127-136`).

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/fursona-list.tsx` (`FursonaListLabels`, `:350-352`)
- Modify: `apps/hub/src/app/[locale]/(app)/pages/page.tsx` (labels, `:143-146`)
- Modify: `es.json`, `en.json` (`fursonas` namespace)
- Test: `apps/hub/tests/fursona-list.test.tsx` (`:121-134`)

**Interfaces:**

- Produces: `FursonaListLabels` gains `emptyTitle: string`, `emptyBody: string`, `emptyAction: string`. The existing `empty` key is removed only if no other file uses it; check with grep.

- [ ] **Step 1: Write the failing tests**

Replace the test at `:121` and add a guard for Review Focus item 5:

```tsx
it("invites a person who owns no fursonas to make one, with no filters to confuse them", () => {
  renderList([person]);
  expect(screen.getByTestId("fursonas-empty")).toHaveTextContent(
    labels.emptyTitle,
  );
  expect(
    screen.getByRole("link", { name: labels.emptyAction }),
  ).toHaveAttribute("href", "/pages/new");
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it("keeps search and filters, and says nothing matches, when a filter hides every fursona", () => {
  filters = { q: "zzz", visibility: "" };
  renderList([person, actor({ handle: "sparky" })]);
  expect(screen.getByRole("searchbox")).toBeInTheDocument();
  expect(screen.getByText("Nothing matches that")).toBeInTheDocument();
  expect(screen.queryByTestId("fursonas-empty")).toBeNull();
});
```

Add to the file's `labels` object (`:54`) `emptyTitle: "Your first fursona is waiting"`, `emptyBody: "Pick a look, give them a name, and they are online."` and `emptyAction: "Make your first fursona"`. If `labels` in this test is typed as `FursonaListLabels`, the compiler will require these keys.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter hub test -- fursona-list` → FAIL.

- [ ] **Step 3: Implement**

In `fursona-list.tsx`, replace the `FursonaFiltersBar` / note pair at `:350-352` with:

```tsx
{
  ownsNone ? (
    <div
      {...tid("fursonas-empty")}
      className="rounded-2xl surface p-6 text-center"
    >
      <PawPrint aria-hidden="true" className="mx-auto size-8 text-(--accent)" />
      <p className="mt-3 font-display text-lg font-bold">{labels.emptyTitle}</p>
      <p className="mt-1 text-sm text-(--muted)">{labels.emptyBody}</p>
      <Link
        href="/pages/new"
        className="mt-4 inline-flex rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--on-accent)"
      >
        {labels.emptyAction}
      </Link>
    </div>
  ) : (
    <>
      <FursonaFiltersBar labels={labels} />
      {note ? <p className="text-sm text-(--muted)">{note}</p> : null}
    </>
  );
}
```

`emptyNote` no longer needs its `ownsNone` branch. Remove that parameter and branch, and update its TSDoc and callers. Import `PawPrint` from `lucide-react`, `Link` from `@/shared/infrastructure/i18n/navigation`, and `tid` if not already imported. The mark's placement leaves room for a future mascot illustration; say so in a comment, pointing to launch spec §2 item 8. The person's own "You" row still renders below, as today.

Catalogues, `fursonas` namespace:

- es: `"emptyTitle": "Tu primera fursona te está esperando"`, `"emptyBody": "Elige un estilo, ponle nombre y ya está en línea."`, `"emptyAction": "Crea tu primera fursona"`
- en: `"emptyTitle": "Your first fursona is waiting"`, `"emptyBody": "Pick a look, give them a name, and they're online."`, `"emptyAction": "Make your first fursona"`

Pass all three from `pages/page.tsx`.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter hub test -- fursona-list fursona-list-page fursona-filters-bar messages message-keys-exist` → PASS. Then run `pnpm --filter hub test:e2e -- signed-in fursona-drag-reorder` → all pass. The `signed-in.spec.ts` case "fursona list is reachable and empty to begin with" asserts only `fursonas-title` and `fursonas-create`, so it should still pass. Add `await expect(page.getByTestId("fursonas-empty")).toBeVisible();` to it.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/presentation/fursona-list.tsx "apps/hub/src/app/[locale]/(app)/pages/page.tsx" apps/hub/src/shared/infrastructure/i18n/messages/es.json apps/hub/src/shared/infrastructure/i18n/messages/en.json apps/hub/tests/fursona-list.test.tsx apps/hub/tests/e2e/signed-in.spec.ts
git commit -m "feat(actors): an empty pages list invites you to make your first fursona"
```

---

### Task 6: "Lo básico"

**The fault:** `apps/hub/src/features/actors/domain/fursona-templates.ts:102` reads `name_es: "Lo basico"`. The only test there checks that the value is truthy (`tests/fursona-templates.test.ts:52`).

**Files:**

- Modify: `apps/hub/src/features/actors/domain/fursona-templates.ts:102`
- Test: `apps/hub/tests/fursona-templates.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("writes the reference sheet's first section name in correct Spanish", () => {
  const sheet = STARTER_LAYOUTS.find(
    (layout) => layout.id === "reference-sheet",
  )!;
  expect(sheet.sections[0]!.name_es).toBe("Lo básico");
});
```

(Use whatever the file already imports `STARTER_LAYOUTS` as.)

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test -- fursona-templates` → FAIL, with `"Lo basico"` received.

- [ ] **Step 3: Fix, run, commit**

Change the string to `"Lo básico"`. Run the same command → PASS. Run `grep -rn "Lo basico" apps scripts` → no matches.

```bash
git add apps/hub/src/features/actors/domain/fursona-templates.ts apps/hub/tests/fursona-templates.test.ts
git commit -m "fix(actors): the reference sheet's first section reads \"Lo básico\""
```

---

### Task 7: The branch as a whole: gates, record, picture proof, PR

**Files:**

- Modify: `docs/HISTORY.md` (a dated bullet for Part A)
- Modify: `docs/superpowers/specs/2026-09-29-hub-launch-polish-design.md` (a status line marker)
- Modify: `CLAUDE.md` (current state: Part A shipped)

- [ ] **Step 1: The full local gate**

Run each command and read its output:

```bash
pnpm lint
pnpm typecheck
pnpm --filter hub test:coverage
pnpm test:tools
pnpm check:tools
pnpm check:contrast
pnpm check:line-endings
set -a; . ./.secrets; set +a; pnpm --filter hub test:e2e
```

Expected: every command passes, and the e2e summary line shows 0 failed. Any failure is diagnosed to its mechanism and fixed. Never rerun hoping it passes.

- [ ] **Step 2: Record**

- `docs/HISTORY.md`: add a dated bullet, "2026-09-29 — hub launch, Part A", with one clause per task and the PR number once it exists.
- The launch spec's `Status` line: append **2026-09-29: Part A delivered (PR #N); Parts B–E designed, not built.**
- `CLAUDE.md` current state: change "designed … and not built" to say that Part A has shipped and B–E are next.

Stage everything, then run `pnpm check:docs --staged` and `pnpm check:agent-notes --staged`. Whenever either names a note, answer it with a sentence that carries information. Commit:

```bash
git commit -m "docs: hub launch Part A is recorded"
```

- [ ] **Step 3: Confirm the base and open the PR**

Run `git fetch origin && git log --oneline origin/main..HEAD`. The output must be exactly this branch's commits. If PR #93 (`scrolled-drag`) merged in the meantime, rebase onto `origin/main`, resolve `block-editor.tsx` conflicts by keeping both changes, and rerun Step 1.

Push with the PAT identity from `docs/git-with-gh-token.md`, then run `gh pr create --base main --title "Hub launch, Part A: the launch fixes" --body-file -`. The body lists the six fixes, their regression tests and sabotage results, and ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 4: Picture proof**

Follow `docs/lessons/conventions/picture-proof-on-the-pr-is-part-of-the-work-not-a-follow-up.md`; the owner runs `/picture-proof`, or Claude follows its procedure. Take these before/after shots at phone width (390×844) and desktop width (1366×860):

- `/es/pages/new` on arrival (the Page form, not a blank panel)
- `/es/sign-in` (Discord, Google, the email form)
- the code step
- `/es/me`
- an empty `/es/pages`
- a pages row whose initial is "E"

Read each picture back, asking what else is in the frame.

The plan ends at the open PR with picture proof. Merging is the owner's call. Part B's plan is written after this merges.
