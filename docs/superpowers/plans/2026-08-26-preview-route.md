# Preview route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline complete-page preview with an `<iframe>` of a real route rendered at a named device size, so viewport-anchored paint (`background-attachment: fixed`, `cover`, container queries at the outermost box) resolves against a real viewport instead of the editor's.

**Architecture:** A new route at `/[locale]/me/preview` renders a blank document that holds nothing until the editor posts it a draft. The editor hosts it in an iframe sized to a named device, scaled down to fit, on a surround wearing the author's own field. The draft crosses by `postMessage`, one post per animation frame, after the iframe announces itself with a `ready` handshake.

**Tech Stack:** Next.js App Router (route groups), React client components, `postMessage`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-26-preview-route-design.md`

## Global Constraints

- The route is `/[locale]/me/preview`, placed at `src/app/[locale]/(preview)/me/preview/page.tsx`. It must NOT sit under `(app)`, whose layout renders `PageShell` with the signed-in bar. Confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md`: only routes resolving to the **same URL path** conflict, so `(app)/me/edit` and `(preview)/me/preview` coexist.
- Device sizes are exactly: phone `390x844`, tablet `768x1024`, desktop `1280x900`.
- Scale is clamped to a maximum of `1`. Never magnify.
- Every message is checked on `event.origin === window.location.origin` **and** `event.source`. Neither alone.
- `Block` and `PublicBlocks` stay the only renderers. No second implementation at any fidelity.
- The preview document is opaque. Its `body` paints the author's field.
- Every export carries TSDoc stating the contract. `pnpm lint` fails without it.
- Run `pnpm lint` from the repository ROOT, never from `apps/hub`.
- Unit coverage must stay at 100% statements/branches/functions/lines.

---

### Task 1: The device table

**Files:**

- Create: `apps/hub/src/features/actors/domain/preview-devices.ts`
- Test: `apps/hub/tests/preview-devices.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `PREVIEW_DEVICES: readonly PreviewDevice[]`, `type PreviewDevice = { id: "phone" | "tablet" | "desktop"; width: number; height: number }`, `type PreviewDeviceId`, `nearestDevice(windowWidth: number): PreviewDeviceId`, `previewScale(deviceWidth: number, available: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  PREVIEW_DEVICES,
  nearestDevice,
  previewScale,
} from "@/features/actors/domain/preview-devices";

describe("PREVIEW_DEVICES", () => {
  it("names three sizes, each with a real viewport", () => {
    expect(PREVIEW_DEVICES.map((d) => [d.id, d.width, d.height])).toEqual([
      ["phone", 390, 844],
      ["tablet", 768, 1024],
      ["desktop", 1280, 900],
    ]);
  });
});

describe("nearestDevice", () => {
  it("answers the size whose WIDTH is nearest the window's", () => {
    expect(nearestDevice(360)).toBe("phone");
    expect(nearestDevice(800)).toBe("tablet");
    expect(nearestDevice(1440)).toBe("desktop");
  });

  // The midpoint between phone (390) and tablet (768) is 579. A ">" rather
  // than ">=" comparison would answer differently on exactly that value, and
  // nothing else in the range discriminates the two.
  it("resolves an exact midpoint without ambiguity", () => {
    expect(nearestDevice(579)).toBe("phone");
    expect(nearestDevice(580)).toBe("tablet");
  });
});

describe("previewScale", () => {
  it("shrinks a device wider than the space", () => {
    expect(previewScale(1280, 640)).toBe(0.5);
  });

  // **Never magnify.** A scaled-up preview misrepresents sharpness and text
  // rendering, which is most of what somebody is looking at.
  it("never exceeds one, however much room there is", () => {
    expect(previewScale(390, 1280)).toBe(1);
    expect(previewScale(390, 390)).toBe(1);
  });

  // A container that has not been measured yet reports 0. Scaling to 0 makes
  // the preview vanish; treating it as "no constraint yet" shows it at full
  // size for one frame, which is the honest degrade.
  it("treats an unmeasured container as unconstrained", () => {
    expect(previewScale(1280, 0)).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-devices.test.ts`
Expected: FAIL — cannot resolve `@/features/actors/domain/preview-devices`.

- [ ] **Step 3: Write the implementation**

```ts
/** One named viewport the complete preview may be rendered at. */
export interface PreviewDevice {
  /** Its stable name, used as a catalogue key and a test id. */
  id: "phone" | "tablet" | "desktop";
  /** The viewport width in CSS pixels. */
  width: number;
  /** The viewport height in CSS pixels. */
  height: number;
}

/** The name of one entry in {@link PREVIEW_DEVICES}. */
export type PreviewDeviceId = PreviewDevice["id"];

/**
 * The sizes the complete preview may be rendered at.
 *
 * **Three named boxes rather than "fill the space", and that is the honest
 * framing rather than a feature.** An iframe is exactly as faithful as its
 * viewport matches a real one, so a preview is always at SOME size; filling
 * the editor's width would invent a viewport height no visitor has, which is
 * the same class of quiet error as the fault this route exists to close.
 *
 * The values are ordinary device viewports rather than this repository's own
 * measured container thresholds: the subject here is what a VISITOR's window
 * is, not where a grid changes its mind.
 */
export const PREVIEW_DEVICES: readonly PreviewDevice[] = [
  { id: "phone", width: 390, height: 844 },
  { id: "tablet", width: 768, height: 1024 },
  { id: "desktop", width: 1280, height: 900 },
];

/**
 * The device whose width is nearest the author's own window.
 *
 * Used to choose the size the preview OPENS at, so a phone editor opens on
 * phone and a desktop editor on desktop — the least surprising default, since
 * it is the size the author is already looking at.
 *
 * A tie resolves to the NARROWER device, which matters only on the exact
 * midpoint between two widths and is stated so the boundary is a decision
 * rather than an accident of comparison order.
 *
 * @param windowWidth - the author's viewport width in CSS pixels.
 * @returns the nearest device's name.
 */
export function nearestDevice(windowWidth: number): PreviewDeviceId {
  let best = PREVIEW_DEVICES[0]!;
  for (const device of PREVIEW_DEVICES) {
    if (
      Math.abs(device.width - windowWidth) < Math.abs(best.width - windowWidth)
    ) {
      best = device;
    }
  }
  return best.id;
}

/**
 * How far to shrink a device box to fit the space available.
 *
 * **Clamped to one, so the preview is never magnified.** Scaling up would
 * misrepresent sharpness and text rendering, which is most of what an author
 * is looking at; scaling down leaves the LAYOUT computed at the true viewport,
 * because a transform does not change the box the page believes it is in.
 *
 * An `available` of zero means the container has not been measured yet, and is
 * treated as no constraint rather than as no room: a scale of zero would make
 * the preview vanish for a frame.
 *
 * @param deviceWidth - the chosen viewport's width.
 * @param available - the room the editor can give it.
 * @returns a scale factor in `(0, 1]`.
 */
export function previewScale(deviceWidth: number, available: number): number {
  if (available <= 0) return 1;
  return Math.min(1, available / deviceWidth);
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-devices.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Sabotage-verify the two that guard a decision**

Change `Math.min(1, …)` to `available / deviceWidth` — "never exceeds one" must go red. Restore.
Change `<` to `<=` in `nearestDevice` — "resolves an exact midpoint" must go red. Restore.
Both watched red, both restored green.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/domain/preview-devices.ts apps/hub/tests/preview-devices.test.ts
git commit -m "feat(actors): the preview's device table"
```

---

### Task 2: The message contract

**Files:**

- Create: `apps/hub/src/features/actors/domain/preview-message.ts`
- Test: `apps/hub/tests/preview-message.test.ts`

**Interfaces:**

- Consumes: `Block` from `domain/block-schema`, `ActorTheme` from `domain/actor-theme`, `PageContext` type only.
- Produces: `PREVIEW_READY: "aeleos:preview-ready"`, `PREVIEW_DRAFT: "aeleos:preview-draft"`, `type PreviewDraft = { kind: typeof PREVIEW_DRAFT; blocks: Block[]; theme: ActorTheme; page: PageContext; locale: string }`, `readPreviewDraft(data: unknown): PreviewDraft | null`, `isPreviewReady(data: unknown): boolean`.

**Why a parser rather than a cast:** the payload arrives from another document. `embed-fit.ts` already establishes the house posture — parse defensively, never evaluate, and answer null for anything unrecognised. This one is same-origin, so the parser is a shape check rather than a trust boundary, and it says so in its own TSDoc rather than implying a guarantee it does not provide.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  PREVIEW_DRAFT,
  PREVIEW_READY,
  isPreviewReady,
  readPreviewDraft,
} from "@/features/actors/domain/preview-message";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";

const draft = {
  kind: PREVIEW_DRAFT,
  blocks: [],
  theme: DEFAULT_THEME,
  page: pageContext(),
  locale: "es",
};

describe("readPreviewDraft", () => {
  it("reads a whole draft", () => {
    expect(readPreviewDraft(draft)).toEqual(draft);
  });

  it.each([
    ["not an object", 7],
    ["null", null],
    ["a different kind", { ...draft, kind: "something-else" }],
    ["no blocks array", { ...draft, blocks: {} }],
    ["no theme", { ...draft, theme: undefined }],
    ["no page", { ...draft, page: undefined }],
    ["a non-string locale", { ...draft, locale: 3 }],
  ])("refuses %s", (_name, value) => {
    expect(readPreviewDraft(value)).toBeNull();
  });
});

describe("isPreviewReady", () => {
  it("recognises the handshake", () => {
    expect(isPreviewReady({ kind: PREVIEW_READY })).toBe(true);
  });

  it.each([
    ["a draft", { kind: PREVIEW_DRAFT }],
    ["a bare string", PREVIEW_READY],
    ["nothing", undefined],
  ])("does not recognise %s", (_name, value) => {
    expect(isPreviewReady(value)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-message.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Write `preview-message.ts` exporting the two constants, the `PreviewDraft` type, `readPreviewDraft` and `isPreviewReady`. `readPreviewDraft` checks: the value is a non-null object; `kind === PREVIEW_DRAFT`; `Array.isArray(blocks)`; `theme` is a non-null object; `page` is a non-null object; `typeof locale === "string"`. It returns the value cast to `PreviewDraft` on success and `null` otherwise. It does NOT re-validate the block tree — `PublicBlocks` is handed lenient-parsed blocks by the sender, and re-parsing here would be a second schema free to drift from `block-schema`.

TSDoc must state: same-origin only, a shape check rather than a trust boundary, and that the caller checks origin and source.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-message.test.ts`
Expected: PASS, 12 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/features/actors/domain/preview-message.ts apps/hub/tests/preview-message.test.ts
git commit -m "feat(actors): the preview draft message contract"
```

---

### Task 3: A page's content column, without the bar

**Files:**

- Create: `apps/hub/src/shared/presentation/page-content.tsx`
- Modify: `apps/hub/src/shared/presentation/page-shell.tsx`
- Test: `apps/hub/tests/page-content.test.tsx`

**Interfaces:**

- Consumes: `SKIN_SCOPE`, `COLUMN` (currently private to `page-shell.tsx`).
- Produces: `PageContent({ width, children }): ReactNode` rendering the `<main>` that carries `SKIN_SCOPE`, `COLUMN[width]` and `data-testid="page-content"`.

**Why:** the preview document needs a page's content column WITHOUT the app bar. `SKIN_SCOPE` must stay declared in exactly one place — `page-shell.tsx`'s own note says a per-page class is one somebody forgets, and the failure is a page whose owner picked a style that silently did nothing.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContent } from "@/shared/presentation/page-content";
import { SKIN_SCOPE } from "@/shared/domain/skins";

describe("PageContent", () => {
  it("is the skin scope and carries the page-content marker", () => {
    render(
      <PageContent width="full">
        <div data-testid="child" />
      </PageContent>,
    );
    const main = screen.getByTestId("page-content");
    expect(main.tagName).toBe("MAIN");
    expect(main).toHaveClass(SKIN_SCOPE);
    expect(main).toContainElement(screen.getByTestId("child"));
  });

  it("holds nothing back at full width", () => {
    render(<PageContent width="full">{null}</PageContent>);
    expect(screen.getByTestId("page-content")).not.toHaveClass("max-w-7xl");
  });

  it("takes the wide column when asked", () => {
    render(<PageContent width="wide">{null}</PageContent>);
    expect(screen.getByTestId("page-content")).toHaveClass("max-w-7xl");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/hub && pnpm exec vitest run tests/page-content.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Extract it**

Move the `<main>` element out of `page-shell.tsx` into `page-content.tsx`, exporting `COLUMN` from the new file and importing it back into `page-shell.tsx` (or leaving `COLUMN` where it is and importing it — whichever keeps one definition). `PageShell` renders `<PageContent width={width}>{children}</PageContent>` in place of its own `<main>`. Every comment currently attached to that `<main>` moves with it — the `SKIN_SCOPE` note and the padding note are about the element, not about the shell.

- [ ] **Step 4: Run the whole shell suite**

Run: `cd apps/hub && pnpm exec vitest run tests/page-content.test.tsx tests/page-shell.test.tsx`
Expected: PASS. `page-shell.test.tsx` must pass UNCHANGED — it asserts from the element side, so an extraction it cannot see is the proof the extraction was faithful.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/presentation/page-content.tsx apps/hub/src/shared/presentation/page-shell.tsx apps/hub/tests/page-content.test.tsx
git commit -m "refactor(shared): a page's content column, apart from its bar"
```

---

### Task 4: The preview document

**Files:**

- Create: `apps/hub/src/features/actors/presentation/preview-document.tsx`
- Create: `apps/hub/src/app/[locale]/(preview)/me/preview/page.tsx`
- Test: `apps/hub/tests/preview-document.test.tsx`

**Interfaces:**

- Consumes: `readPreviewDraft`, `PREVIEW_READY` (Task 2), `PageContent` (Task 3), `PublicBlocks`, `ThemeScope`.
- Produces: `PreviewDocument(): ReactNode`.

**Behaviour:** on mount it posts `{ kind: PREVIEW_READY }` to `window.parent` at `window.location.origin`. It listens for messages, ignoring any whose `event.origin !== window.location.origin` or whose `event.source !== window.parent`. A message `readPreviewDraft` accepts replaces the rendered draft. Until one arrives it renders nothing at all.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PreviewDocument } from "@/features/actors/presentation/preview-document";
import {
  PREVIEW_DRAFT,
  PREVIEW_READY,
} from "@/features/actors/domain/preview-message";
import { DEFAULT_THEME } from "@/features/actors/domain/actor-theme";
import { pageContext } from "./helpers/page-context";

const draft = {
  kind: PREVIEW_DRAFT,
  blocks: [
    {
      kind: "container",
      mode: "stack",
      spaces: 1,
      name_en: "A section",
      children: [
        { kind: "text", title_en: "A title", description_en: "Words" },
      ],
    },
  ],
  theme: DEFAULT_THEME,
  page: pageContext(),
  locale: "en",
};

/** Delivers one message as the parent window would. */
function post(data: unknown, over: Partial<MessageEventInit> = {}) {
  act(() => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: window.parent,
        ...over,
      }),
    );
  });
}

describe("PreviewDocument", () => {
  it("announces itself to the parent and renders nothing until told", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<PreviewDocument />);
    expect(post).toHaveBeenCalledWith(
      { kind: PREVIEW_READY },
      window.location.origin,
    );
    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("renders the draft it is sent", () => {
    render(<PreviewDocument />);
    post(draft);
    expect(screen.getByText("A section")).toBeInTheDocument();
    expect(screen.getByText("A title")).toBeInTheDocument();
  });

  // Origin and source are checked independently, and each case removes ONE of
  // them: a test that broke both could pass with either check missing.
  it("ignores a message from another origin", () => {
    render(<PreviewDocument />);
    post(draft, { origin: "https://evil.example" });
    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("ignores a message from another source", () => {
    render(<PreviewDocument />);
    post(draft, { source: null });
    expect(screen.queryByTestId("public-section")).toBeNull();
  });

  it("ignores a message it cannot read", () => {
    render(<PreviewDocument />);
    post({ kind: "something-else" });
    expect(screen.queryByTestId("public-section")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-document.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component and the route**

`preview-document.tsx` is `"use client"`. It holds `const [draft, setDraft] = useState<PreviewDraft | null>(null)`, registers the listener in a `useEffect` and posts `PREVIEW_READY` in the SAME effect, after `addEventListener` — so the parent cannot answer before the listener exists. Rendering: `draft === null` returns `null`; otherwise

```tsx
<ThemeScope theme={draft.theme}>
  <PageContent width="full">
    <PublicBlocks
      blocks={draft.blocks}
      locale={draft.locale}
      page={draft.page}
    />
  </PageContent>
</ThemeScope>
```

The route file is a server component rendering `<PreviewDocument />` and nothing else. It sits at `src/app/[locale]/(preview)/me/preview/page.tsx` so it inherits `[locale]/layout.tsx` — real `<html>`, real `<body>`, the theme scripts and the canvas — and NOT `(app)/layout.tsx`, which would give it the signed-in bar.

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd apps/hub && pnpm exec vitest run tests/preview-document.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Sabotage-verify both halves of the check**

Remove the origin check — "ignores a message from another origin" must go red while the source case stays green. Restore.
Remove the source check — the source case must go red while the origin case stays green. Restore.
That independence is the point: one test failing for both removals would mean neither check is pinned.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/features/actors/presentation/preview-document.tsx "apps/hub/src/app/[locale]/(preview)" apps/hub/tests/preview-document.test.tsx
git commit -m "feat(actors): a preview document that holds only what it is sent"
```

---

### Task 5: The editor hosts the iframe

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/complete-page-preview.tsx`
- Modify: `apps/hub/src/app/[locale]/(app)/pages/labels.ts` (device names, size label)
- Modify: `apps/hub/messages/en.json`, `apps/hub/messages/es.json`
- Test: `apps/hub/tests/complete-page-preview.test.tsx`

**Interfaces:**

- Consumes: `PREVIEW_DEVICES`, `nearestDevice`, `previewScale` (Task 1); `PREVIEW_DRAFT`, `isPreviewReady` (Task 2).
- Produces: `CompletePagePreview` with the same props plus `labels.devices: Record<PreviewDeviceId, string>` and `labels.sizeHint: string`.

**Behaviour:** the disclosure now renders an `<iframe src={`/${lang}/me/preview`}>` at the chosen device's exact width and height, wrapped in a surround that wears `background: var(--field)` and carries a size label. The iframe is `transform: scale(previewScale(device.width, available))` with `transform-origin: top left`; the surround's own box is `device.height * scale` tall so the scaled iframe does not overlap what follows. `available` comes from a `ResizeObserver` on the surround.

The parent sends a draft only after `isPreviewReady`, then on every change to `blocks`/`theme`/`page`/`lang`, coalesced to one post per animation frame.

- [ ] **Step 1: Write the failing test**

```tsx
it("mounts the preview route at the chosen device size and sends nothing before it is ready", () => {
  render(
    <CompletePagePreview
      blocks={blocks}
      theme={DEFAULT_THEME}
      lang="es"
      page={pageContext()}
      labels={labels}
    />,
  );
  fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));

  const frame = screen.getByTestId("complete-page-preview-frame");
  expect(frame).toHaveAttribute("src", "/es/me/preview");
  expect(frame).toHaveAttribute("width", "1280");
  expect(frame).toHaveAttribute("height", "900");
});

it("switches the device and re-sizes the frame", () => {
  render(/* …as above… */);
  fireEvent.click(screen.getByTestId("complete-page-preview-toggle"));
  fireEvent.click(screen.getByTestId("preview-device-phone"));
  const frame = screen.getByTestId("complete-page-preview-frame");
  expect(frame).toHaveAttribute("width", "390");
  expect(frame).toHaveAttribute("height", "844");
});
```

Plus: the existing "starts collapsed / unmounts when closed" case, kept, with its assertions moved from `public-section` to the frame.

- [ ] **Step 2: Run and watch it fail**

Run: `cd apps/hub && pnpm exec vitest run tests/complete-page-preview.test.tsx`
Expected: FAIL — no `complete-page-preview-frame`.

- [ ] **Step 3: Rewrite the component**

Replace the `PreviewThemeHost` + `PublicBlocks` body with the iframe host described above. Delete the `atmosphereCss` mount and the `lenientBlockSchema` parse — the parse moves to the SENDER, because what crosses the channel must already be renderable and the receiver must not carry a second schema.

Keep: the disclosure, `WidePageColumn` for the control row, the `aria-expanded`/`aria-controls` wiring, and the note that the preview stays outside `DndContext`.

- [ ] **Step 4: Run the suite and watch it pass**

Run: `cd apps/hub && pnpm exec vitest run tests/complete-page-preview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add both catalogue entries and check them**

Add `fursonas.preview.devices.{phone,tablet,desktop}` and `fursonas.preview.sizeHint` to `en.json` and `es.json`; build the label record in `labels.ts` by MAPPING `PREVIEW_DEVICES`, so a device added without a name fails the build.

Run: `cd apps/hub && pnpm exec vitest run tests/messages.test.ts tests/message-keys-exist.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/hub/src apps/hub/messages apps/hub/tests
git commit -m "feat(actors): the complete preview is an iframe at a named device size"
```

---

### Task 6: Delete what the iframe replaced

**Files:**

- Modify: `apps/hub/src/features/actors/presentation/preview-theme-host.tsx`
- Modify: `apps/hub/src/features/actors/domain/actor-theme.ts`
- Modify: `apps/hub/tests/preview-theme-host.test.tsx`
- Modify: `apps/hub/tests/actor-theme.test.ts`

**Interfaces:**

- Produces: `PreviewThemeHost` WITHOUT the `atmosphere` prop; `previewThemeCss` emitting ONE rule again.

**Why now and not sooner:** these are dead only once Task 5 has stopped calling them. Removing an uncalled option rather than leaving it is deliberate — `COLUMN.full` existed, was documented in three places, had no caller, and two headline features shipped broken behind it.

- [ ] **Step 1: Delete the `document` mode**

Remove `PreviewAtmosphere`, the `atmosphere` prop and `PREVIEW_ATMOSPHERE`. `PreviewThemeHost` always paints its own field. Its TSDoc keeps the `background-attachment` paragraph — that trade-off still binds every tray — and gains a sentence saying the complete preview no longer shares it, with a pointer to the route.

- [ ] **Step 2: Collapse `previewThemeCss` back to one rule**

The picture layers return to the single `[data-preview-theme]` rule. Delete the `:not()` selector and its comment.

- [ ] **Step 3: Update both suites**

Delete the two `atmosphere` cases from `preview-theme-host.test.tsx` and the emitted-selector assertions from `actor-theme.test.ts`. Keep "paints its own field by default" — renamed, since there is no longer a "by default" to contrast with.

- [ ] **Step 4: Run everything and confirm 100%**

Run: `cd apps/hub && pnpm exec vitest run --coverage`
Expected: PASS at 100% on all four axes. A branch left uncovered here means a mode survived its caller.

- [ ] **Step 5: Commit**

```bash
git add -A apps/hub/src apps/hub/tests
git commit -m "refactor(actors): drop the document-atmosphere mode the iframe replaced"
```

---

### Task 7: Close the fixture gap, then compare through the iframe

**Files:**

- Modify: `apps/hub/tests/e2e/preview-fidelity.spec.ts`
- Modify: `apps/hub/tests/e2e/complete-page-fidelity.spec.ts`
- Modify: `apps/hub/tests/e2e/responsive.spec.ts`
- Modify: `apps/hub/tests/e2e/atmosphere.spec.ts`

**The fixture gap is closed FIRST, before the comparison is rewritten.** Add `backgroundUrl` to the `preview-fidelity` fixture's theme — a `data:` SVG, so the fixture stays off the network — and confirm the OLD inline preview would have failed on it. That confirmation is the whole point: it is the evidence that the guard could not see the fault, rather than a claim that it could not.

- [ ] **Step 1: Add a background picture to the fixture and watch the comparison redden on the OLD code**

Stash the branch's source changes (`git stash push -- apps/hub/src`), add `backgroundUrl` to the fixture, run `preview-fidelity`. Expected: sections differ well over budget, because the inline preview anchors the photo to the editor's window. Record the numbers. Restore with `git stash pop`.

- [ ] **Step 2: Rewrite the comparison to photograph through the iframe**

`photographPreview` sets the preview to the DESKTOP device (1280x900), which is the same viewport `photographPublic` uses, then photographs sections inside `frame.contentFrame()`. `quietTheWindow` keeps hiding the canvas on both sides and STOPS flattening `--field`: there is no longer a window-anchoring difference to excuse, so the photo itself must match.

- [ ] **Step 3: Run it and watch it pass**

Run: `cd apps/hub && set -a; . ../../.secrets; set +a; pnpm exec playwright test preview-fidelity --project=chromium`
Expected: PASS, with the background-picture fixture now matching.

- [ ] **Step 4: Move the geometry suites inside the frame**

`complete-page-fidelity.spec.ts` measures the six measures, bleed and the container-query case inside `frame.contentFrame()`. Its "keeps horizontal excess reachable" case becomes a statement about the iframe's own document. `responsive.spec.ts`'s complete-preview assertions become "the frame is present at the phone device size". `atmosphere.spec.ts` loses the case for the preview trigger — that behaviour is deleted — and keeps the theme-panel case untouched.

- [ ] **Step 5: Sabotage-verify the four the spec names**

Each watched red and restored: the `ready` handshake removed so the parent posts on `load`; the origin check removed; the source check removed; the scale allowed to exceed 1; the device size ignored so the iframe fills the width (the background picture must go back to differing).

- [ ] **Step 6: Confirm `frame-ancestors` admits our own origin, in a browser**

The spec says this is to be checked rather than reasoned about.
`frame-src` already carries `'self'`; `frame-ancestors` is what the FRAMED
document sends, and a policy that omits `'self'` refuses to be embedded at all
— with the failure appearing as a blank frame and a console violation rather
than an error anything asserts.

Add to `preview-fidelity.spec.ts` a case that fails on any console message
matching `Content Security Policy` while the preview is open, so a policy
change that breaks framing is caught by the suite rather than by an author.

- [ ] **Step 7: Commit**

```bash
git add -A apps/hub/tests
git commit -m "test(actors): compare through the iframe, on a page that has a photo"
```

---

### Task 8: The documentation moves with the code

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-24-atmosphere-and-page-fidelity-design.md`
- Modify: `docs/superpowers/specs/2026-08-26-preview-route-design.md` (status)

- [ ] **Step 1: Correct every claim the iframe falsified**

The feature note's "page-faithful, not pixel-exact" paragraph, its scroll-container paragraph, and its atmosphere bullet all describe an inline preview that no longer exists. The 2026-08-24 spec's deferred-iframe paragraph becomes "delivered, and here is what it cost". The root `CLAUDE.md` bullet for 2026-08-25 gains the correction. Mark the route spec implemented.

**Grep for the old arrangement rather than trusting memory**: `overflow-x-auto`, `atmosphere="document"`, `PREVIEW_ATMOSPHERE`, "page-faithful".

- [ ] **Step 2: Run the doc gates**

```bash
cd Z:/Github/aeleos
pnpm -s format
git add -A && node scripts/check-doc-freshness.mjs --staged; git reset
pnpm -s exec cspell --no-progress "**/*.md"
```

Expected: docs moved with the code; no spelling issues.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(actors): the preview is a route now"
```

---

### Task 9: The whole gate, then the PR

- [ ] **Step 1: Every local gate**

```bash
cd Z:/Github/aeleos
pnpm lint                                   # from the ROOT, never apps/hub
pnpm -C apps/hub exec tsc --noEmit -p tsconfig.json
pnpm -C apps/hub exec vitest run --coverage # 100% on all four axes
pnpm -s check:tools
cd apps/hub && set -a; . ../../.secrets; set +a
pnpm exec playwright test --project=chromium
```

Expected: all green. **Check the browser suite's case COUNT, not the word "passed"** — a run without secrets silently skips the half that needs Clerk.

- [ ] **Step 2: Measure the two costs the spec refused to hand-wave**

The spec names both and declines to call them negligible: the preview now
boots a route on open, and every keystroke crosses a document boundary.
Measure rather than assert — open the disclosure and record time to first
paint inside the frame, and type into a leaf while counting posts per
delivered keystroke, at a 6x CPU throttle. Write both numbers into the spec's
"Known costs" section, whatever they are. A number nobody took is the thing
rule 10 exists about.

- [ ] **Step 3: Picture proof, then the PR**

Photograph the preview at each device size, and the background-picture fixture page against its preview. Post as a comment on the PR using the PAT in `.secrets` and the procedure in `docs/git-with-gh-token.md`; upload as a release asset named `pr-<n>-proof`, as PRs 11 and 14 did. Do not commit the images.
