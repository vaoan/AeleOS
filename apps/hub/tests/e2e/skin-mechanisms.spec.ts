import { expect, test } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";
import { apart, sampleColours, type Probe } from "./support/pixels";

// WHY THIS FILE EXISTS.
//
// `neon`, `cutout` and `frame` each earn their place by a MECHANISM none of the
// other skins use — a shadow with no offset, a clipped outline, rings stacked
// outside one border. Every one of those is a thing that can be present in the
// compiled CSS, correct in `getComputedStyle`, and invisible on the page: an
// ancestor clipping the overflow eats the rings and the glow, a `clip-path` the
// engine declined leaves the corner square, and a token nothing reads changes
// nothing at all. This project has already shipped a control that offered a
// choice, stored it and did nothing — the canvases named after animations
// nobody had written — and a stylesheet rule that read correctly on paper and
// lost the cascade for months. Neither would have been caught by asserting what
// the code emits.
//
// So this reads the PIXELS Chromium painted. The screenshot is decoded inside
// the page itself, through an `Image` and a canvas, which needs no image
// dependency in the repository — `data:` is already in `img-src`, see
// `shared/domain/csp.ts`.
//
// **The load-bearing trick is that it measures the same pixels twice**, once as
// shipped and once with `--skin-shadow` and `--skin-clip` forced back to
// `none`. A probe compared against its own neighbour has to clear whatever the
// page's gradient and the nebula do across those few pixels, which is small but
// not zero — measured at 18 for one card while the very effect under test was
// disabled, against a threshold of 25. The same probe before and after
// neutralising holds the background exactly constant, because neither
// `box-shadow` nor `clip-path` affects layout.
//
// **That last clause is the one claim here that used to be an argument**, in a
// file whose whole thesis is that arguments about rendering do not count — and
// the `plain` card cannot stand in for it, being first in DOM order and so
// blind to anything below it shifting. Every card's box is therefore re-read
// after the style tag and asserted identical, which turns the premise into a
// measurement. What `plain` proves is the other half: a card wearing no skin
// sets neither token, so its every probe must come back unchanged.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/** The sections the page is built from, in the order they render. */
const SECTIONS = ["plain", "neon", "cutout", "frame"] as const;

/**
 * The viewport, tall enough to hold every card at once.
 *
 * Each probe is a point on ONE screenshot, so a page that scrolled between
 * measuring a card and taking that screenshot would sample the right
 * coordinates of the wrong pixels — silently, and with plausible-looking
 * numbers. That happened while this test was being written. The height is
 * asserted against every card's box below, so the day this page outgrows it is
 * a failure rather than a wrong answer.
 */
const VIEWPORT = { width: 1280, height: 2200 };

/**
 * How far in from a card's top-left corner the corner probe sits.
 *
 * Four rather than three because the ordinary card is `rounded-xl` — at three
 * the design's own 12px radius has already cut that pixel, and the probe would
 * be answering a question about `rounded-xl` instead. Its other constraint,
 * that it stay inside `cutout`'s chamfer, is asserted against the resolved
 * `clip-path` rather than left to agree by luck.
 */
const CORNER = 4;

/**
 * How far outside a card's right edge the moulding probe sits.
 *
 * `frame`'s rings land at known distances — the mat spans one to six pixels
 * out and the moulding six to eight — so this is inside the outer ring and
 * outside the mat. It is also the widest probe, which is what the viewport's
 * width is checked against.
 */
const MOULDING = 6;

/** What `--skin-shadow` and `--skin-clip` are turned off with. */
const NEUTRALISED =
  "*{--skin-shadow:none!important;--skin-clip:none!important}";

test.describe("the skin mechanisms, painted rather than merely declared", () => {
  test("neon glows outside its box, cutout removes its corner, frame stacks rings around it", async ({
    page,
  }) => {
    const identity = await createTestIdentity();
    try {
      // One section per skin, each holding one `text` leaf. A leaf's card is
      // the plain `surface` every probe below reads — it names no skin token
      // of its own, so what it paints is whatever the block enclosing it set.
      // `plain` carries no `style` at all and is the control.
      //
      // Seeded straight into the database as a real Clerk-authenticated
      // caller — see `support/blocks.ts` — for the reason
      // `section-skin-nesting.spec.ts` gives at length: what is under test is
      // entirely on the read side, and driving the editor to get there would
      // make this fail for reasons that have nothing to do with what it
      // claims.
      const { address, handle } = await seedPage({
        userId: identity.userId,
        handlePrefix: "mech",
        displayName: "Skin Mechanisms",
        blocks: SECTIONS.map((skin) =>
          container({
            name_en: skin,
            children: [leaf({ title_en: "Card" })],
            ...(skin === "plain" ? {} : { style: { skin } }),
          }),
        ),
      });

      // The nebula is a live canvas behind every page, so two screenshots
      // would otherwise catch it on different frames. Reduced motion is the
      // app's own way of holding it still, and asking for it here is what
      // makes the before-and-after comparison below mean anything.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(VIEWPORT);
      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      const cards = page.getByTestId("public-leaf").locator("> div");
      await expect(cards).toHaveCount(SECTIONS.length);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      // `boundingBox()` reports CSS pixels; `getImageData` indexes the
      // screenshot's DEVICE pixels. They agree only at a ratio of one, which
      // is what `devices["Desktop Chrome"]` gives today. At two, every probe
      // would land at half its intended offset — well inside the cards, where
      // every delta is zero and the assertions fail for a reason nobody would
      // find quickly. Named here instead.
      expect(await page.evaluate(() => devicePixelRatio)).toBe(1);

      const probes: Probe[] = [];
      const boxes = [];
      for (const [index, name] of SECTIONS.entries()) {
        const box = (await cards.nth(index).boundingBox())!;
        boxes.push(box);
        expect(box.y + box.height + 2).toBeLessThan(VIEWPORT.height);
        const mid = Math.round(box.y + box.height / 2);
        const left = Math.round(box.x);
        const top = Math.round(box.y);
        // The first pixel column outside the card's border box.
        const out = Math.round(box.x + box.width);
        // The width bound the height already had. Out of bounds,
        // `getImageData` returns zeros in BOTH screenshots, so a probe off the
        // right edge reads as delta 0 and fails — safely, and unhelpfully.
        expect(out + MOULDING).toBeLessThan(VIEWPORT.width);
        probes.push(
          // Four pixels in from the top-left, and a point along the same top
          // edge well clear of it. `cutout`'s chamfer takes the first away and
          // leaves the second. Four rather than three because the ordinary
          // card is `rounded-xl` — at three, the design's own radius has
          // already cut that pixel and the probe would be answering a question
          // about `rounded-xl` instead.
          { name: `${name}-corner`, x: left + CORNER, y: top + CORNER },
          { name: `${name}-edge`, x: left + 30, y: top + CORNER },
          // Outside the right edge, where nothing but a shadow can reach.
          // `frame`'s rings land at known distances — the mat spans one to six
          // pixels out and the moulding six to eight — and `neon`'s glow is
          // strongest against the border.
          { name: `${name}-glow`, x: out + 1, y: mid },
          { name: `${name}-mat`, x: out + 3, y: mid },
          { name: `${name}-moulding`, x: out + MOULDING, y: mid },
          // The other three sides, for `neon` alone: a glow surrounds its box
          // where a cast shadow falls to one side of it.
          { name: `${name}-above`, x: left + 30, y: top - 1 },
          {
            name: `${name}-below`,
            x: left + 30,
            y: Math.round(box.y + box.height) + 1,
          },
          { name: `${name}-before`, x: left - 1, y: mid },
        );
      }

      // Read before the tokens are neutralised, for the obvious reason: after
      // it, every one of these resolves to `none`.
      const resolved = {
        neon: await cards
          .nth(1)
          .evaluate((el) => getComputedStyle(el).boxShadow),
        cutout: await cards
          .nth(2)
          .evaluate((el) => getComputedStyle(el).clipPath),
      };

      const shipped = await sampleColours(page, probes);
      await page.addStyleTag({ content: NEUTRALISED });
      const without = await sampleColours(page, probes);

      // **The premise, measured rather than argued.** Everything below reads
      // one coordinate out of two screenshots and attributes the difference to
      // a token; that only follows if the page did not move between them.
      // Neither `box-shadow` nor `clip-path` participates in layout — which is
      // exactly the kind of claim this file exists to refuse on anybody else's
      // behalf.
      for (const [index] of SECTIONS.entries()) {
        expect(await cards.nth(index).boundingBox()).toEqual(boxes[index]);
      }

      /** What neutralising those tokens did to one probe. */
      const changed = (name: string) => apart(shipped[name]!, without[name]!);

      // **The control, and it is the half that gives every threshold below its
      // power to fail.** A card wearing no skin sets neither token, so every
      // one of its probes must be the same pixel in both screenshots — which
      // is also the proof that nothing about the page moved between them.
      for (const probe of [
        "corner",
        "edge",
        "glow",
        "mat",
        "moulding",
        "above",
        "below",
        "before",
      ]) {
        expect(changed(`plain-${probe}`), `plain-${probe}`).toBeLessThan(6);
      }

      // `neon`: a spread shadow with no offset paints past the border on every
      // side, and stops being painted when the token is taken away. All four
      // sides are probed because that is what distinguishes a glow from a cast
      // — a shadow displaced far enough to read as a light source leaves at
      // least one side of its box untouched. The exact declaration is pinned
      // as well, since "no offset" is a claim about the value and the sides
      // alone would also hold for a small displacement.
      for (const side of ["glow", "above", "below", "before"]) {
        expect(changed(`neon-${side}`), `neon-${side}`).toBeGreaterThan(25);
      }
      expect(resolved.neon).toMatch(/0px 0px 16px 2px/);

      // `cutout`: the corner is cut away and the edge beside it is not — the
      // one skin that changes a surface's shape. Asserted twice over: the
      // corner comes back when `--skin-clip` is neutralised, and within the
      // shipped page it differs from a point thirty pixels along the same
      // edge, which the unskinned card's own corner does not.
      expect(changed("cutout-corner")).toBeGreaterThan(25);
      expect(
        apart(shipped["cutout-corner"]!, shipped["cutout-edge"]!),
      ).toBeGreaterThan(25);
      expect(
        apart(shipped["plain-corner"]!, shipped["plain-edge"]!),
      ).toBeLessThan(10);
      expect(resolved.cutout).toMatch(/^polygon\(/);
      // **The corner probe and the chamfer are numbers in two different
      // files.** `CORNER` was chosen against `rounded-xl`'s 12px radius, and
      // nothing tied it to the notch — narrowing the notch to 8px would put
      // the probe exactly on the clip's edge and turn this assertion into an
      // antialiasing coin flip, failing with a message naming neither number.
      // The notch is read back out of the resolved value instead, and the
      // perpendicular margin asserted.
      //
      // **It reads the DECLARED bound, not the used one.**
      // `getComputedStyle().clipPath` keeps `min(10px, 25%)` unresolved, so
      // this is 10 whatever the card measures. On a card this size the used
      // notch really is 10px, so the assertion is honest — but on a box
      // narrower than 40px it would report 10 while the real notch was
      // smaller, which is the coupling this removes one level up and leaves
      // one level down. Closing it means computing the percentage against a
      // box, which is the browser's job.
      const notch = Number(/(\d+(?:\.\d+)?)px/.exec(resolved.cutout)?.[1]);
      expect(notch).toBeGreaterThan(0);
      expect(
        CORNER * 2,
        "the corner probe sits inside the chamfer",
      ).toBeLessThan(notch - 1);

      // `frame`: the mat and the moulding are separate rings outside the
      // border rather than one thick edge. Both vanish with the token, and in
      // the shipped page they differ from each other — which is the stacking
      // itself, and what a single wider shadow could not produce.
      expect(changed("frame-mat")).toBeGreaterThan(15);
      expect(changed("frame-moulding")).toBeGreaterThan(40);
      expect(
        apart(shipped["frame-mat"]!, shipped["frame-moulding"]!),
      ).toBeGreaterThan(20);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
