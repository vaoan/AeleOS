import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  mintSessionToken,
  mintTicket,
  signIn,
} from "./support/clerk-session";

// WHAT THIS GUARDS, AND WHY IT IS NOT THE CANVAS SUITE.
//
// `canvas-performance.spec.ts` measures one canvas at a time on a signed-out
// page with no theme, no sections and no scroll, on an unthrottled desktop
// runner. Every regression this repository has actually shipped to a
// PERSONALISED page was invisible to that: a skin's backdrop blur across every
// surface on a long page, a layout that grew the DOM, a theme control that
// restyles the whole document on every movement of a finger. A budget measured
// unthrottled at a device ratio of one would have found none of them.
//
// So this seeds as large a page as `set_actor_sections`'s document cap allows —
// every mode and every leaf kind that does not embed, wearing the most
// expensive skins — and measures it at 390x844, `deviceScaleFactor: 3`, with
// the CPU throttled. Two things, because they are two different costs:
//
//  * **scrolling the public page**, which is what a skin, an arrangement and a
//    background picture decide; and
//  * **moving a theme dial in the editor**, which is style INVALIDATION —
//    every movement rewrites a custom property at `:root` and restyles every
//    element beneath it, so the bill is linear in the editor's DOM. That is the
//    number that regresses when somebody adds a block kind or a control.
//
// **Both run.** The second was stood down for the length of the block model's
// first two phases, because the editor of the day held a flat list of sections
// and this fixture is built from mode/kind pairs the flat vocabulary has no
// name for — so the route opened empty and there was no heavy DOM left to
// invalidate. Its own node guard is what noticed, and the editor port restored
// it. What it measures now, and how the numbers moved, is written above the
// test itself; do not relax a ceiling to make either of them run.
//
// **The dial is measured twice, by two different questions, and only one of
// them is a stopwatch.** How much one movement COSTS is milliseconds and so is
// a function of the runner; how many movements are PAID FOR is a count, and a
// count divides out. See `COMMITS_PER_INPUT_CEILING` for why the second replaced
// a latency ceiling that could not tell the two builds apart.
//
// **Both are measured with the canvas held off, deliberately.** The canvas is
// the most expensive thing on either page by a wide margin and it has its own
// budget next door; leaving it on here would swamp everything this file is for,
// and every ceiling would have to be set so high it could not fail. Turning it
// off was measured not to change the style bill at all — 2 007ms against
// 2 538ms across a drag, in the opposite direction — so nothing this file
// asserts depends on it being there.
//
// **The two ceilings in milliseconds and percent are smoke alarms, like
// `FRAME_CEILING_MS` next door, and for the same reason.** A shared runner is
// slower than a laptop by an amount nobody can predict. They sit far above what
// the page costs here and far below what a regression of the size this file
// exists for costs. Do not tighten them toward the measured values: a
// performance test that cries wolf gets skipped.
//
// **`COMMITS_PER_INPUT_CEILING` is not one of those and must not be read as
// one.** It is a ratio of two counts taken in the same run, so it does not move
// with the runner at all — measured identical at three throttle rates — and its
// headroom is a property of the mechanism rather than a guess about hardware. A
// ceiling in milliseconds was tried here first, failed CI on correct code, and
// was found to have no value that separates the two builds. That account is in
// its own doc, because a budget that was removed for being unable to fail
// honestly is the one thing somebody is most likely to reintroduce.
//
// **Every figure quoted below was taken against a production build**, because
// dev-mode numbers say little about paint cost. The `canvas` job runs this
// against `pnpm dev`, as it already does the frame-cost suite — measured there
// too, and comfortably inside the same ceilings.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

/**
 * How much of one `input` event's cost may be restyling the document.
 *
 * **This is the number that regresses when somebody adds a block kind or a
 * control to the editor**, because the bill for rewriting a custom property at
 * `:root` is linear in how many elements sit beneath it. Measured on this page
 * at a 4x throttle and 4 622 nodes: 63.8ms.
 *
 * The ceiling is nearly four times that, which is a smoke alarm for the
 * editor's DOM roughly doubling on a runner twice as slow as this one.
 *
 * **The editor's DOM has since grown by two thirds and this figure moved by an
 * eighth**, which is worth stating rather than leaving somebody to infer that
 * the growth was free. Re-measured on the same route and the same seed after
 * the block editor landed, on the same machine at the same throttle: **7 778
 * nodes, 72.0ms per input event**, against the 4 622 and 63.8ms above. Every
 * section now renders a live `Block` preview inside its card, so the document
 * carries the editing controls and the page they describe at once.
 *
 * **Do not read that pair as "the preview is nearly free."** The paragraph
 * below this one says why: the drag saturates the main thread, so the
 * numerator is bounded by `SAMPLE_MS` and the figure is closer to
 * `SAMPLE_MS / inputs` than to a per-event cost. A node count that rose 1.7x
 * against a millisecond figure that rose 1.13x is what that saturation looks
 * like, not a measurement of what the preview costs. What the pair does
 * establish is the thing the guard was standing by for: the ported editor
 * renders a COMPARABLE document rather than a far smaller one, so the ceilings
 * beneath it are measuring the page they were calibrated against.
 *
 * **Two things it does NOT catch, because a budget nobody knows the limits of
 * gets trusted past them.**
 *
 * It does not catch the dials' frame coalescing being removed — measured at
 * 124.3ms against the coalesced 80.0ms on the same machine at the same throttle,
 * both comfortably inside the ceiling. `COMMITS_PER_INPUT_CEILING` is what fails
 * on that.
 *
 * And it is partly an artefact of the sample window rather than a pure cost.
 * The drag saturates the main thread, so the numerator is bounded by
 * `SAMPLE_MS` and the figure is close to `SAMPLE_MS / inputs` — which makes it
 * as much a measure of how FEW movements a slow runner delivered as of what
 * each one cost. Measured: 2 399ms of restyling over 30 movements here, and
 * 23 movements delivered on the CI runner, which puts that runner near 110 with
 * the same numerator. That is the headroom, and it shrinks as a runner gets
 * slower rather than as the code gets worse. Do not read it as a pure per-event
 * cost.
 */
const STYLE_MS_PER_INPUT_CEILING = 250;

/**
 * How many theme commits one delivered movement of a dial may be worth.
 *
 * **The budget with the power here, and it is a ratio because a stopwatch could
 * not do this job.** A dial records every movement and commits the newest one on
 * the next animation frame, so the number of full-document restyles is bounded
 * by FRAMES rather than by input events. Remove that and it is bounded by input
 * events instead, which is the whole fault: one restyle of a 4 600-node document
 * per movement of a finger.
 *
 * Both terms are counted in the same run on the same runner — commits from the
 * theme `<style>` element actually changing, movements from the `input` events
 * the renderer actually delivered — so runner speed divides out. Measured
 * against a production build at CPU throttles of 1x, 4x and 6x:
 *
 * | build | 1x | 4x | 6x |
 * | --- | --- | --- | --- |
 * | coalescing in place | 0.006 | 0.006 | 0.006 |
 * | coalescing removed at the source | 1.000 | 1.000 | 1.000 |
 *
 * Nine readings, no overlap, and the ratio does not move with the throttle at
 * all — which is what a runner-independent budget looks like and what the
 * latency ceiling it replaced never managed. **That ceiling is gone rather than
 * relaxed.** The same unmodified build measured a median input-to-frame of
 * 17.6ms and 575.4ms at a 6x throttle in two runs minutes apart, against
 * 836.1ms for the sabotaged build — distributions that overlap, so no number
 * separates them. The CI runner's 283ms sat inside that spread, which is why it
 * failed on code that was correct.
 *
 * **The denominator is proved independent of the code under test rather than
 * assumed**, which is the trap the frame-cost ratio next door fell into: every
 * run of this burst delivered exactly 175 movements — coalesced, sabotaged, and
 * at every throttle — while the numerator moved from 1 to 175. A control that
 * moves with the numerator divides the fault away, and this one demonstrably
 * does not.
 *
 * The ceiling is forty times the measured value and four times below the fault.
 * The good side is one-sided by construction: commits can never exceed the
 * frames produced during the burst, and a slower runner produces fewer.
 */
const COMMITS_PER_INPUT_CEILING = 0.25;

/**
 * How many arrow presses the coalescing burst sends.
 *
 * **Keys rather than a mouse drag, and that is the measurement rather than a
 * convenience.** A renderer coalesces pending `mousemove` events to about one
 * per frame before anything in the page sees them, so a mouse drag delivers
 * roughly one movement per frame however hard it is driven — and a control that
 * commits once per frame is then indistinguishable from one that commits once
 * per event. Measured: 0.6 commits per movement with the coalescing in place
 * against 1.0 without, on a drag, which is not a separation anybody should build
 * a budget on. Key events are never coalesced, so a burst of them creates the
 * condition the fix exists for — input arriving faster than frames — on any
 * runner rather than only on a slow one.
 *
 * It is also a real way to move a slider: a held arrow key is how somebody who
 * does not use a mouse changes one of these.
 *
 * Sent in runs of {@link BURST_RUN} rather than alternating singly. A press
 * immediately undone inside one frame commits the value it started at, React
 * writes no new CSS text, and the whole burst honestly reports zero commits —
 * which passes the budget while proving nothing.
 */
const BURST_KEYS = 200;

/** How many presses go one way before the burst turns round. */
const BURST_RUN = 25;

/**
 * The fewest delivered movements that make the ratio mean anything.
 *
 * A burst that reached the control four times could report a flattering ratio
 * from a page that was never touched, exactly as a divide by zero would. Every
 * run measured here delivered 175 of the 200 sent — the remainder lost to the
 * track's own ends — so this is well under what a working burst produces and
 * well over what a broken one would.
 */
const LEAST_BURST_INPUTS = 100;

/**
 * The most of the main thread scrolling the public page may take.
 *
 * Measured here at 13.3% with the canvas off, on the largest page the database
 * will accept, at a 4x throttle. This is six times that: an order-of-magnitude
 * alarm for a skin, a layout or a background that starts costing real money to
 * scroll past, on the understanding that a shared runner is slower than this
 * machine by an amount nobody can predict.
 */
const SCROLL_BUSY_CEILING_PCT = 80;

/**
 * How hard to throttle, and it is not applied to everything here.
 *
 * Four, matching the profile the investigation used. **The scroll sample and the
 * drag sample take it; the coalescing burst deliberately does not**, and the
 * difference is what each measurement is made of. A percentage of the main
 * thread and a millisecond are only a phone's if the CPU is a phone's, so those
 * two need it. The burst's answer is a ratio of two counts taken in the same
 * run: measured identical at 1x, 4x and 6x, so throttling it would multiply the
 * variance of a number that has none and add half a minute to every run for it.
 * A throttle is not free — it is the thing that makes a budget flaky — so it is
 * spent only where it buys something.
 */
const THROTTLE = 4;

/** A phone, at the ratio a phone really has. */
const PHONE = { width: 390, height: 844 };

/** How long each sample runs. Long enough for a median, short enough for CI. */
const SAMPLE_MS = 3000;

/**
 * How many bytes of `JSON.stringify` to aim under.
 *
 * `set_actor_sections` refuses a document over 65 536 bytes, but it measures
 * `octet_length(p_sections::text)` — and Postgres renders `jsonb` back out with
 * a space after every colon and comma, which `JSON.stringify` does not write.
 * On a document of this shape that is several thousand bytes of difference, so
 * counting the bytes sent and comparing them against the server's limit
 * overshoots. Aiming well under is cheaper than a round trip per attempt, and
 * the count is reported in the log either way.
 */
const DOCUMENT_BUDGET = 56_000;

/** The most leaves to try per section before the size cap is consulted. */
const MOST_ITEMS = 12;

/**
 * The sections, in render order: an arrangement, a track count where the mode
 * lays places across, the skin the section wears, and the kind of leaf it
 * holds.
 *
 * **No embedding kind is here, and that is deliberate rather than an
 * oversight.** `player` and `post` put a third party's renderer in an iframe,
 * which is a network dependency and a second renderer process — neither of
 * which this file is measuring, and both of which would make it fail for
 * reasons that have nothing to do with this repository. `picture` is out for
 * the same reason.
 *
 * **Every section is a flat container holding leaves, and none nests.** That
 * keeps the page the same SHAPE the budget below was calibrated against, so a
 * change in the numbers is a change in what the renderer costs rather than in
 * what it was asked to render. Nesting multiplies node count, which is exactly
 * why `MAX_DEPTH` exists — measuring it is worth its own budget rather than a
 * silent redefinition of this one.
 */
const PLAN = [
  { mode: "grid", spaces: 3, skin: "glass", kind: "text" },
  { mode: "grid", spaces: 4, skin: "aero", kind: "text" },
  { mode: "masonry", spaces: 3, skin: "comic", kind: "text" },
  { mode: "grid", spaces: 2, skin: "glass", kind: "stat" },
  { mode: "accordion", skin: "blueprint", kind: "text" },
  { mode: "grid", spaces: 2, skin: "terminal", kind: "stat" },
  { mode: "grid", spaces: 3, skin: "neon", kind: "text" },
  { mode: "masonry", spaces: 2, skin: "frame", kind: "text" },
  { mode: "grid", spaces: 3, skin: "cutout", kind: "text" },
  { mode: "grid", spaces: 4, skin: "aero", kind: "stat" },
  { mode: "stack", skin: "glass", kind: "link" },
  { mode: "timeline", skin: "sticker", kind: "text" },
  { mode: "stack", skin: "clay", kind: "quote" },
  { mode: "grid", spaces: 2, skin: "candy", kind: "progress" },
  { mode: "grid", spaces: 3, skin: "glass", kind: "social" },
  { mode: "grid", spaces: 3, skin: "glass", kind: "text" },
  { mode: "carousel", skin: "aero", kind: "text" },
  { mode: "tabs", skin: "retro", kind: "text" },
  { mode: "masonry", spaces: 3, skin: "outline", kind: "text" },
  { mode: "accordion", skin: "inset", kind: "text" },
] as const;

/** A many-stop gradient, a blurred skin, and every canvas dial at its top. */
const THEME = {
  background: {
    kind: "linear",
    repeating: false,
    every: 50,
    angle: 135,
    shape: "ellipse",
    extent: "farthest-corner",
    x: 50,
    y: 50,
    stops: [
      { color: "#1b2a4a", at: 0 },
      { color: "#3d2a5c", at: 20 },
      { color: "#6b2d5c", at: 40 },
      { color: "#a33b5a", at: 60 },
      { color: "#d4713f", at: 80 },
      { color: "#f2c14e", at: 100 },
    ],
  },
  accent: "#e21233",
  canvasColours: ["#ec8e4a", "#d66a60", "#c9587a", "#a25ec8"],
  canvas: "nebula",
  backgroundFit: "cover",
  skin: "glass",
  density: 5,
  speed: 5,
  scale: 5,
};

/**
 * The page at a given size.
 *
 * @param items - how many leaves each section carries.
 * @returns the document `set_actor_sections` is handed.
 */
function build(items: number) {
  return PLAN.map((plan, index) => ({
    kind: "container",
    mode: plan.mode,
    ...("spaces" in plan ? { spaces: plan.spaces } : {}),
    name_en: `Section ${index + 1}`,
    name_es: `Seccion ${index + 1}`,
    style: { skin: plan.skin },
    children: Array.from({ length: items }, (_, item) => ({
      kind: plan.kind,
      title_en: `Item ${item + 1} of section ${index + 1}`,
      title_es: `Elemento ${item + 1}`,
      description_en:
        plan.kind === "progress"
          ? `${(item * 8) % 100}%`
          : `A description long enough to wrap onto several lines on a phone, which is what a real page carries. Item ${item + 1}.`,
      description_es: `Una descripcion suficientemente larga. Elemento ${item + 1}.`,
      ...(plan.kind === "text" ? { icon: "star" } : {}),
      ...(plan.kind === "link" || plan.kind === "social"
        ? { link_url: "https://example.com/somebody" }
        : {}),
    })),
  }));
}

/**
 * The biggest page the database will take.
 *
 * **Found by trying rather than written down**, because the cap is on the
 * document's BYTES and the document grows every time a layout or a style key
 * does. A hard-coded item count was the first version of this and it failed on
 * the first run with `sections are too large` — which would have become a
 * failure somebody eventually "fixed" by shrinking the page this measures.
 *
 * @returns the page, at the most leaves that fit.
 */
function sections() {
  for (let items = MOST_ITEMS; items > 1; items -= 1) {
    const built = build(items);
    const bytes = Buffer.byteLength(JSON.stringify(built));
    if (bytes < DOCUMENT_BUDGET) {
      console.log(
        `seeding ${PLAN.length} sections of ${items} leaves — ${bytes} bytes`,
      );
      return built;
    }
  }
  return build(1);
}

declare global {
  /** How many `input` events the renderer actually delivered to the dial. */
  var __inputs: number | undefined;
  /** How many times the theme's own `<style>` element has been rewritten. */
  var __commits: number | undefined;
  /** How many animation frames the page has produced since it was installed. */
  var __frames: number | undefined;
}

/** The CDP counters this file attributes cost with. */
interface Counters {
  /** Every task the main thread ran, in seconds. */
  task: number;
  /** Of that, recalculating style. */
  style: number;
  /** The renderer's clock, in seconds. */
  timestamp: number;
}

/**
 * Reads the main thread's counters.
 *
 * @param cdp - the session, with `Performance` already enabled.
 * @returns the counters, in seconds.
 */
async function counters(cdp: CDPSession): Promise<Counters> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const read = (name: string) =>
    metrics.find((metric) => metric.name === name)?.value ?? 0;
  return {
    task: read("TaskDuration"),
    style: read("RecalcStyleDuration"),
    timestamp: read("Timestamp"),
  };
}

/**
 * Waits for the page to produce a number of animation frames.
 *
 * A condition rather than a fixed sleep, for the reason
 * `canvas-performance.spec.ts` gives about its own: how long a frame takes is
 * the thing under measurement, so a wall-clock wait is shortest exactly when
 * the page is slowest. This is what settles a throttle change and the first
 * paint after a navigation before anything is sampled.
 *
 * @param page - the page to wait on.
 * @param count - how many frames, from now.
 * @returns nothing.
 */
async function settle(page: Page, count: number): Promise<void> {
  await page.evaluate(() => {
    if (globalThis.__frames !== undefined) return;
    globalThis.__frames = 0;
    const tick = () => {
      globalThis.__frames = (globalThis.__frames ?? 0) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const from = await page.evaluate(() => globalThis.__frames ?? 0);
  await page.waitForFunction(
    (wanted) => (globalThis.__frames ?? 0) >= wanted,
    from + count,
    { timeout: 120_000 },
  );
}

/**
 * Holds the canvas off for the rest of the page's life.
 *
 * See the header: the canvas has its own budget and would otherwise be
 * everything either measurement here saw.
 *
 * @param page - the page to quiet.
 * @returns nothing.
 */
async function stopTheCanvas(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--canvas", "none");
  });
}

/** Where the seeded page lives. */
interface SeededPage {
  /** The owner's canonical address. */
  address: string;
  /** The fursona's handle. */
  handle: string;
}

/**
 * Writes the heaviest page the database will take, as its owner.
 *
 * Extracted so the two measurements below can each have it without a second
 * copy of it. They were one test until the editor lost its subject — see the
 * note above the second — and a seed written twice is a seed that stops being
 * the same page.
 *
 * Every RPC result is asserted, because a half-failed seed produces a short
 * page and a very comfortable number about it.
 *
 * @param userId - the Clerk user to write as.
 * @returns the address and handle the page is served at.
 */
async function seedTheHeaviestPage(userId: string): Promise<SeededPage> {
  const jwt = await mintSessionToken(userId);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    },
  );

  const { error: provisionError } = await supabase.rpc("ensure_person_actor");
  expect(provisionError).toBeNull();

  const handle = `cost${Date.now().toString().slice(-9)}`;
  const { data: actorRef, error: createError } = await supabase.rpc(
    "create_fursona",
    {
      p_handle: handle,
      p_display_name: "Personalised Page Cost",
      p_avatar_url: null,
      p_visibility: "public",
    },
  );
  expect(createError).toBeNull();

  const { error: sectionsError } = await supabase.rpc("set_actor_sections", {
    p_actor_ref: actorRef,
    p_sections: sections(),
  });
  expect(sectionsError).toBeNull();

  const { error: themeError } = await supabase.rpc("set_actor_theme", {
    p_actor_ref: actorRef,
    p_theme: THEME,
  });
  expect(themeError).toBeNull();

  const { data: address, error: addressError } =
    await supabase.rpc("my_address");
  expect(addressError).toBeNull();

  return { address: address as string, handle };
}

test.describe("what a heavily personalised page costs on a phone", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ viewport: PHONE, deviceScaleFactor: 3 });

  test("scrolling it", async ({ page }) => {
    // Seeding, a page load and a throttled sample.
    test.setTimeout(300_000);

    const identity = await createTestIdentity();
    try {
      const { address, handle } = await seedTheHeaviestPage(identity.userId);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.emulateMedia({ reducedMotion: "no-preference" });

      // ------------------------------------------------------------------
      // Scrolling the public page.
      // ------------------------------------------------------------------
      const response = await page.goto(`/es/${address}/${handle}`);
      expect(response?.status()).toBe(200);
      await page.waitForSelector("canvas");
      await stopTheCanvas(page);

      // Proof the page really is the heavy one before anything is asserted
      // about it. A seed that half failed would otherwise report a very
      // comfortable number about a very short page.
      const tall = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      expect(
        tall,
        "the seeded page is not the long one this measures",
      ).toBeGreaterThan(PHONE.height * 8);

      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
      // Frames rather than milliseconds, so the throttle and the first paint
      // are actually past before anything is sampled — see `settle`.
      await settle(page, 10);

      const scrollBefore = await counters(cdp);
      await page.evaluate(async (ms) => {
        const started = performance.now();
        // A real scroll rather than one jump: what is being measured is the
        // cost of bringing new content into view, over and over.
        while (performance.now() - started < ms) {
          window.scrollBy(0, 240);
          if (
            window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 1
          ) {
            window.scrollTo(0, 0);
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }, SAMPLE_MS);
      const scrollAfter = await counters(cdp);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

      const scrollWall =
        (scrollAfter.timestamp - scrollBefore.timestamp) * 1000;
      const scrollBusy =
        ((scrollAfter.task - scrollBefore.task) * 1000 * 100) / scrollWall;
      console.log(`scroll busy: ${scrollBusy.toFixed(1)}%`);
      expect(
        scrollBusy,
        "scrolling a personalised page takes too much of the main thread",
      ).toBeLessThan(SCROLL_BUSY_CEILING_PCT);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });

  // ---------------------------------------------------------------------
  // STOOD DOWN FOR TWO PHASES, AND RESTORED BY THE ONE ITS OWN NOTE NAMED.
  //
  // This half measures style INVALIDATION: every movement of a theme dial
  // rewrites a custom property at `:root` and restyles every element beneath
  // it, so the bill is linear in the editor's DOM. It caught a real
  // regression — a dial that stuck at 3.8 fps on a throttled phone, fixed by
  // coalescing to one report per frame — and `COMMITS_PER_INPUT_CEILING` is
  // what keeps that fix from being undone.
  //
  // **It lost its subject when the model changed, and its own guard is what
  // noticed.** The database began storing a tree of blocks while the editor
  // still held a flat list, so this route opened on `sections: []` and
  // rendered 309 nodes where the guard wants more than 2 000. That guard fired
  // exactly as designed: the thing under measurement was no longer the thing.
  // Rather than lower the threshold — a green performance check that tells
  // nobody anything — the measurement stood down in place, visibly, with the
  // condition that would restore it written here.
  //
  // **The editor port is that condition and this is the reading it owed.** The
  // editor composes and reads a block tree now, so `seedTheHeaviestPage` above
  // writes a page this route can open, `PLAN` did not have to be rewritten
  // into flat-shaped pairs, and the ceilings below are measuring the document
  // they were calibrated against. The acceptance criterion this note set was
  // that the ported editor render a COMPARABLE DOM rather than a far smaller
  // one, and it does: **7 778 nodes against the 4 622 the ceiling was
  // calibrated at**, because every section now renders a live `Block` preview
  // inside its card. Style recalculation moved from 63.8ms to **72.0ms per
  // input event** on the same machine at the same throttle, and the coalescing
  // ratio is **0.006** — identical to the recorded value for a build with the
  // fix in place, against 1.000 for one without. See
  // `STYLE_MS_PER_INPUT_CEILING` for why the millisecond pair must not be read
  // as "the preview is nearly free".
  //
  // **Read twice, minutes apart on the same build**, because one reading of a
  // performance number and a coin toss look identical: 7 778 nodes / 72.0ms
  // over 30 delivered movements, then 7 777 / 77.5ms over 22. The node count
  // is stable to one element — the difference is a focus ring's element, not
  // noise in the measurement — and the millisecond figure moves with how many
  // movements a run happened to deliver, which is precisely the saturation
  // caveat `STYLE_MS_PER_INPUT_CEILING` describes. The ratio read 0.006 both
  // times, which is what a runner-independent budget looks like.
  //
  // **`PLAN` holds no embedding kind, so this measures no third-party frame.**
  // The preview makes the editor mount whatever the page holds, which for a
  // page with `player` or `post` leaves means real provider iframes in the
  // edit screen. That cost is outside this reading and is not bounded by it.
  //
  // The scrolling half above is unaffected and always ran: the PUBLIC page
  // renders the tree, so its subject was intact throughout.
  // ---------------------------------------------------------------------
  test("dragging a theme dial in its editor", async ({ page }) => {
    test.setTimeout(300_000);

    const identity = await createTestIdentity();
    try {
      const { handle } = await seedTheHeaviestPage(identity.userId);

      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Performance.enable");
      await page.emulateMedia({ reducedMotion: "no-preference" });

      await signIn(page, await mintTicket(identity.userId));
      await page.goto(`/es/pages/${handle}/edit`);
      await page.getByTestId("theme-open").click();
      const dial = page.getByTestId("theme-density");
      await dial.waitFor();
      await dial.scrollIntoViewIfNeeded();
      await page.waitForSelector("canvas");
      await stopTheCanvas(page);

      // The multiplier on everything below. Asserted rather than reported, for
      // the same reason the page height is: a seed that half failed would give
      // a comfortable answer about a page nobody has.
      const nodes = await page.evaluate(
        () => document.querySelectorAll("*").length,
      );
      expect(
        nodes,
        "the editor under measurement is not the heavy one",
      ).toBeGreaterThan(2000);

      // Both counters live in the page. Movements are counted where they are
      // DELIVERED rather than where they are dispatched, because a throttled
      // main thread coalesces pointer moves before anything here sees them; and
      // commits are counted at the theme's own `<style>` element, which is the
      // document actually being restyled rather than a proxy for it.
      const watching = await page.evaluate(() => {
        globalThis.__inputs = 0;
        globalThis.__commits = 0;
        document.addEventListener(
          "input",
          () => {
            globalThis.__inputs = (globalThis.__inputs ?? 0) + 1;
          },
          true,
        );
        const style = [...document.querySelectorAll("style")].find((element) =>
          (element.textContent ?? "").includes("--accent"),
        );
        if (!style) return false;
        new MutationObserver((records) => {
          globalThis.__commits = (globalThis.__commits ?? 0) + records.length;
        }).observe(style, {
          characterData: true,
          childList: true,
          subtree: true,
        });
        return true;
      });
      // A budget counting commits at an element that is not there would report
      // zero for ever, which is the best possible score.
      expect(
        watching,
        "the theme preview's own style element was not found to watch",
      ).toBe(true);

      const box = (await dial.boundingBox())!;
      const y = box.y + box.height / 2;
      const left = box.x + 4;
      const right = box.x + box.width - 4;
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
      await settle(page, 10);
      await page.evaluate(() => {
        globalThis.__inputs = 0;
        globalThis.__commits = 0;
      });

      await cdp.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: left,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });

      const dragBefore = await counters(cdp);
      const started = Date.now();
      const moves = 120;
      for (let move = 0; move < moves; move += 1) {
        const due = started + (move * SAMPLE_MS) / moves;
        const wait = due - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        const along = move / (moves - 1);
        // Back and forth, so the value keeps changing rather than saturating
        // at one end and delivering events that alter nothing.
        const at = along < 0.5 ? along * 2 : (1 - along) * 2;
        // Not awaited: the cadence has to be the wall clock's rather than the
        // round trip's, or a slow page is measured with less input than a fast
        // one and the per-event figure flatters it.
        void cdp
          .send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: left + (right - left) * at,
            y,
            button: "left",
            buttons: 1,
          })
          .catch(() => {});
      }
      const dragAfter = await counters(cdp);
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: right,
        y,
        button: "left",
        buttons: 1,
        clickCount: 1,
      });
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

      const seen = await page.evaluate(() => globalThis.__inputs ?? 0);
      // Nothing below means anything if the drag never reached the control —
      // and a divide by an input count of zero would report a very good number.
      expect(seen, "the drag delivered no input event at all").toBeGreaterThan(
        4,
      );
      const stylePerInput =
        ((dragAfter.style - dragBefore.style) * 1000) / seen;
      console.log(
        `style recalc: ${stylePerInput.toFixed(1)}ms per input event, over ${seen} events, ${nodes} nodes`,
      );

      // ------------------------------------------------------------------
      // How many of those movements were paid for — the coalescing budget.
      // Unthrottled, and by keyboard: see COMMITS_PER_INPUT_CEILING and
      // BURST_KEYS for why neither of those is a convenience.
      // ------------------------------------------------------------------
      await dial.focus();
      await settle(page, 10);
      await page.evaluate(() => {
        globalThis.__inputs = 0;
        globalThis.__commits = 0;
      });

      const sends: Promise<unknown>[] = [];
      for (let key = 0; key < BURST_KEYS; key += 1) {
        const forward = Math.floor(key / BURST_RUN) % 2 === 1;
        const press = {
          windowsVirtualKeyCode: forward ? 39 : 37,
          nativeVirtualKeyCode: forward ? 39 : 37,
          key: forward ? "ArrowRight" : "ArrowLeft",
          code: forward ? "ArrowRight" : "ArrowLeft",
        };
        // Not awaited, for the same reason the drag's moves are not: the burst
        // has to outrun the renderer, and a round trip per press would pace it
        // to the round trip instead.
        sends.push(
          cdp
            .send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...press })
            .catch(() => {}),
          cdp
            .send("Input.dispatchKeyEvent", { type: "keyUp", ...press })
            .catch(() => {}),
        );
      }
      await Promise.all(sends);

      // Waited on the count settling rather than on every press arriving: some
      // are lost to the track's own ends, so "all of them arrived" never
      // becomes true and a wait for it would only ever time out.
      let last = -1;
      for (let poll = 0; poll < 40; poll += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const now = await page.evaluate(() => globalThis.__inputs ?? 0);
        if (now === last) break;
        last = now;
      }

      const moved = await page.evaluate(() => globalThis.__inputs ?? 0);
      const commits = await page.evaluate(() => globalThis.__commits ?? 0);
      console.log(
        `theme commits: ${commits} over ${moved} delivered movements (${(commits / Math.max(moved, 1)).toFixed(3)} each)`,
      );
      expect(
        moved,
        "the burst barely reached the dial, so the ratio below means nothing",
      ).toBeGreaterThanOrEqual(LEAST_BURST_INPUTS);
      expect(
        commits / moved,
        "a theme dial restyles the document once per movement rather than once per frame",
      ).toBeLessThan(COMMITS_PER_INPUT_CEILING);

      expect(
        stylePerInput,
        "a theme dial restyles too much of the document per movement",
      ).toBeLessThan(STYLE_MS_PER_INPUT_CEILING);
    } finally {
      await deleteTestIdentity(identity.userId);
    }
  });
});
