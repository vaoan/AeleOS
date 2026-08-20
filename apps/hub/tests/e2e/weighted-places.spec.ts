import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage, type SeedBlock } from "./support/blocks";
import { placesOf, tracksOf } from "./support/grid";

// THE BROWSER PROOF OF THE FLOOR, THE RATIO AND THE COLLAPSE.
//
// `trackListFor` (`domain/block-tracks.ts`) turns a container's `weights` into
// a `grid-template-columns` string, and `block-tracks.test.ts` is a complete
// proof of that STRING. None of what makes the feature real is visible there:
// a container query resolving at all, a `minmax` floor holding a sliver open,
// and the collapse to one track below the threshold are every one of them
// resolved by LAYOUT, which jsdom does not run and a unit test cannot see.
// This file asks a real layout engine.
//
// **The page is seeded straight into the database**, exactly as
// `blocks-render.spec.ts` does and for the same reason: a public page needs no
// sign-in to read, and driving the editor to build one would fail these cases
// for reasons that are not about weighted tracks.
//
// THE VIEWPORT WIDTHS BELOW ARE MEASURED, NOT GUESSED. The `@lg`/`@2xl`/etc.
// container queries `SPACE_CLASS` carries measure the enclosing `<section>`,
// never the viewport — and the page's own column sits between the two
// (`max-w-7xl` with horizontal padding), so a viewport picked to clear a
// threshold in rem can still leave the section under it: the brief's own draft
// picked 540px for the three-place floor case, "just above `@lg` (32rem)", and
// that is BELOW the real threshold, which collapses the case it was meant to
// protect.
//
// Each width below was found by binary search — narrow to wide, 1px precision
// — against `tracksOf` on a page seeded with exactly this shape (unweighted
// `grid` containers at each space count, this branch's build, chromium): the
// narrowest viewport at which the container's own `<section>` actually
// resolves N tracks rather than collapsing to one.
//
//   spaces=2  threshold=352px   spaces=4  threshold=720px
//   spaces=3  threshold=544px   spaces=5  threshold=944px
//                                spaces=6  threshold=1072px
//
// The measurement script lived at `_measure-thresholds.spec.ts` in this folder
// for the run and was deleted once these numbers were recorded here — it is
// not a fixture this suite needs again unless a threshold or the page's own
// padding changes.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * One section: a `grid` container at depth 0, carrying weights.
 *
 * @param over - fields to replace or add — `spaces`, `weights`, `children`.
 * @returns the section.
 */
const section = (over: SeedBlock = {}): SeedBlock =>
  container({ mode: "grid", name_en: "Weighted", ...over });

test("lays the author's ratio once there is room for it", async ({ page }) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "weightratio",
    displayName: "Ratio",
    blocks: [
      section({
        spaces: 3,
        weights: [1, 3, 1],
        children: [
          leaf({ title_en: "Left" }),
          leaf({ title_en: "Middle" }),
          leaf({ title_en: "Right" }),
        ],
      }),
    ],
  });

  // A laptop-width desktop: the same LAPTOP fixture `blocks-render.spec.ts`
  // uses, comfortably clear of every threshold in the vocabulary.
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  const grid = page.getByTestId("block-grid").first();
  const [left, middle, right] = await tracksOf(grid);
  expect(middle! / left!).toBeGreaterThan(2.5);
  expect(middle! / right!).toBeGreaterThan(2.5);
});

test("puts the wide place where the author put it, which a palindrome cannot prove", async ({
  page,
}) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "weightorder",
    displayName: "Order",
    blocks: [
      section({
        spaces: 3,
        // NOT a palindrome: [1,3,1] reversed is itself and a reversal bug in
        // `trackListFor` would go unnoticed by it. [3,1,2] reversed is [2,1,3],
        // a different list, so "first is widest, third beats second" is only
        // true if the author's own order was kept.
        weights: [3, 1, 2],
        children: [
          leaf({ title_en: "First" }),
          leaf({ title_en: "Second" }),
          leaf({ title_en: "Third" }),
        ],
      }),
    ],
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  const grid = page.getByTestId("block-grid").first();
  const [first, second, third] = await tracksOf(grid);
  expect(first!).toBeGreaterThan(third!);
  expect(third!).toBeGreaterThan(second!);
});

test("floors a sliver when there is not much room", async ({ page }) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "weightfloor",
    displayName: "Floor",
    blocks: [
      section({
        spaces: 3,
        weights: [1, 6, 1],
        children: [
          leaf({ title_en: "Left" }),
          leaf({ title_en: "Middle" }),
          leaf({ title_en: "Right" }),
        ],
      }),
    ],
  });

  // Measured threshold for 3 places is 544px (see file header); 552px keeps
  // an 8px margin above it so the case is not sitting exactly on the boundary
  // it depends on clearing.
  await page.setViewportSize({ width: 552, height: 900 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  const grid = page.getByTestId("block-grid").first();

  // RULING 2: the grid must actually be laying 3 tracks before the floor is
  // asked about — a still-collapsed grid answers one track whose width
  // trivially clears 8rem (128px), and the assertion below would pass having
  // proved nothing at all. This is rule 27's trap in this file's own words.
  const tracks = await tracksOf(grid);
  expect(tracks).toHaveLength(3);

  const [left, , right] = tracks;
  // 8rem at the default 16px root.
  expect(left!).toBeGreaterThanOrEqual(128);
  expect(right!).toBeGreaterThanOrEqual(128);
});

test("does not overflow at any threshold", async ({ page }) => {
  // A genuine overflow check at genuine widths — but like "collapses to
  // one track" above, it is also satisfied trivially by a permanently
  // collapsed grid (a single narrow column cannot overflow). Sabotage 1
  // above (dropping the `@lg:` prefix) confirmed this directly: this case
  // stayed green even while the 3-place layout never rendered its tracks
  // at all. It is a real assertion, just not one that on its own proves
  // the weighted tracks are being laid.
  //
  // MEASURED (see file header), each with a 2px margin above the exact
  // binary-searched boundary: the narrowest viewport at which the container's
  // own `<section>` resolves that many tracks — the tightest, and therefore
  // worst-case-for-overflow, width at which each shape is actually laid.
  const THRESHOLDS = [
    [2, 354],
    [3, 546],
    [4, 722],
    [5, 946],
    [6, 1074],
  ] as const;

  for (const [spaces, width] of THRESHOLDS) {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: `weightover${spaces}`,
      displayName: `Overflow ${spaces}`,
      blocks: [
        section({
          spaces,
          // The most lopsided shape the model admits at this count: one
          // sliver-floored place beside every other place maxed at 6.
          weights: [1, ...Array(spaces - 1).fill(6)],
          children: Array.from({ length: spaces }, (_, i) =>
            leaf({ title_en: `Leaf ${i}` }),
          ),
        }),
      ],
    });

    await page.setViewportSize({ width, height: 900 });
    expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

    await page.addStyleTag({
      content: "nextjs-portal{display:none!important}",
    });
    const overflowPast = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflowPast, `spaces=${spaces} at ${width}px`).toBeLessThanOrEqual(
      1,
    );
  }
});

test("collapses to one track and keeps stored order on a phone", async ({
  page,
}) => {
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "weightphone",
    displayName: "Phone",
    blocks: [
      section({
        spaces: 3,
        weights: [1, 3, 1],
        children: [
          leaf({ title_en: "one" }),
          leaf({ title_en: "two" }),
          leaf({ title_en: "three" }),
        ],
      }),
    ],
  });

  await page.setViewportSize({ width: 320, height: 900 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  // NOT PINNED BY ANY SABOTAGE ACTUALLY RUN — reported honestly rather than
  // left implied, per the branch's own repeated lesson about checks that look
  // like measurements and are not (root CLAUDE.md rules 23/27).
  //
  // Two sabotages were tried against `SPACE_CLASS`'s three-place entry in
  // `blocks.tsx`, both restored afterward (`git diff` empty each time):
  //
  // 1. DROP the `@lg:` prefix entirely, leaving the class unconditional. This
  //    did not make 3 tracks "apply at every width" — in this build the
  //    unprefixed arbitrary-property utility loses the cascade to the base
  //    `grid-cols-1` already on the element (same specificity, and
  //    `grid-cols-1` sorts later in the generated stylesheet), so 3 tracks
  //    resolved at NEITHER 1280px nor 552px. What reddened instead were the
  //    ratio, order and floor cases above, which all require 3 tracks to
  //    exist at all; this case and "does not overflow" stayed green, because
  //    a permanently-collapsed grid trivially satisfies both "one track" and
  //    "no overflow".
  //
  // 2. LOWER the threshold from `@lg:` (32rem) to `@xs:` (20rem), leaving the
  //    query intact but too eager — the fix prescribed to actually
  //    discriminate this case. Measured result: still 5/5 green, this case
  //    included. Why: `@xs:` needs the enclosing `<section>` itself at
  //    20rem/320px, and the page's own column padding sits between viewport
  //    and section — measured elsewhere in this file, the narrowest VIEWPORT
  //    that clears `@xs:` for a two-place container is 352px, not 320px. This
  //    test's phone viewport is exactly 320px, which is already below that
  //    padded-out `@xs:` floor, so the sabotaged threshold never fired at the
  //    width this case tests. The sabotage was real and measured (verified by
  //    the same binary-search method as the file header's thresholds) — it
  //    just was not aggressive enough to reach 320px once page padding is
  //    accounted for.
  //
  // So: nothing this suite has actually run has failed this specific
  // assertion. What WOULD pin it, unverified because changing a threshold or
  // a fixture is out of this round's scope: a sabotage using a container
  // query one step below `@xs:` in Tailwind's default scale (`@2xs`, 18rem, or
  // `@3xs`, 16rem) would need roughly 288–320px of viewport once the same
  // padding is added back, which is close enough to this test's 320px that it
  // may or may not cross it depending on exact padding — that arithmetic is
  // untested and would need the same binary-search treatment as the other
  // thresholds before trusting it. Absent that, the honest statement is: this
  // assertion is a genuine claim (the phone case really does need 1 track,
  // not 3, and would fail if the renderer ever emitted 3 unconditionally) but
  // it currently has no sabotage on record that reddens it specifically —
  // only the three cases above it are proven to depend on `@lg:`'s presence.
  const grid = page.getByTestId("block-grid").first();
  expect(await tracksOf(grid)).toHaveLength(1);

  // Not `h3`: `blocks.tsx`'s own TSDoc on `PlainLeaf` says a leaf's title is
  // "styled as a heading and is **not** a heading element" — it is a `<span>`,
  // because a leaf sits at any depth and a real heading tag would skip or
  // repeat a level depending on what contains it. `placesOf` reads each
  // place's plain text instead, in DOM order, which is what "keeps stored
  // order" actually has to mean here.
  const order = (await placesOf(grid)).map((place) => place.text.trim());
  expect(order).toEqual(["one", "two", "three"]);
});

test("a nested unweighted grid does not inherit its ancestor's tracks", async ({
  page,
}) => {
  // CSS custom properties INHERIT. `--block-tracks` is set on the weighted
  // grid's own div (`blocks.tsx`'s `Grid`), and every `SPACE_CLASS` entry
  // reads `var(--block-tracks, repeat(n,minmax(0,1fr)))`. `var()` uses its
  // fallback only when the property is NOT SET on the element asking — an
  // INHERITED value counts as set. So an unweighted grid nested anywhere
  // beneath a weighted one resolves the ANCESTOR's track list instead of its
  // own uniform fallback, laying as many tracks as the ancestor declared
  // (here 3, at the ancestor's 1:3:1 ratio) rather than its own 2 equal ones.
  //
  // The middle place of the outer section is exactly where the preset
  // seeding puts a `stack` — an ordinary place to drop a nested grid — so
  // this is the ordinary shape the model produces, not an exotic one.
  const { address, handle } = await seedPage({
    userId: identity!.userId,
    handlePrefix: "weightnest",
    displayName: "Nested",
    blocks: [
      section({
        spaces: 3,
        weights: [1, 3, 1],
        children: [
          leaf({ title_en: "Left" }),
          container({
            mode: "grid",
            spaces: 2,
            children: [leaf({ title_en: "A" }), leaf({ title_en: "B" })],
          }),
          leaf({ title_en: "Right" }),
        ],
      }),
    ],
  });

  // The laptop fixture already proven (above) to lay the outer 3-place ratio
  // clearly, which leaves the middle place — the inner grid's own containing
  // box — comfortably past the 2-place threshold (352px) too.
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await page.goto(`/es/${address}/${handle}`))?.status()).toBe(200);

  // Two `block-grid` elements exist on this page: the outer weighted one and
  // the inner unweighted one nested inside its middle place, in DOM order.
  const grids = page.getByTestId("block-grid");
  const outer = grids.nth(0);
  const inner = grids.nth(1);

  // The outer grid is genuinely laying its ratio — otherwise the inner
  // grid's containing box is not the width this test believes it measured
  // (rule 27: prove the setup before asking about the thing it sets up).
  const outerTracks = await tracksOf(outer);
  expect(outerTracks).toHaveLength(3);
  expect(outerTracks[1]! / outerTracks[0]!).toBeGreaterThan(2.5);

  const innerTracks = await tracksOf(inner);
  expect(innerTracks).toHaveLength(2);
  expect(
    Math.abs(innerTracks[0]! - innerTracks[1]!),
    `inner tracks: ${innerTracks.join(", ")}`,
  ).toBeLessThan(2);
});
