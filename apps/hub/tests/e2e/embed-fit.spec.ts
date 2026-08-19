import { expect, test, type Page } from "@playwright/test";
import {
  createTestIdentity,
  deleteTestIdentity,
  hasClerk,
  type TestIdentity,
} from "./support/clerk-session";
import { container, leaf, seedPage } from "./support/blocks";
import { PLAYER_ORIGINS } from "../../src/shared/domain/player-origins";

// WHY THIS FILE EXISTS.
//
// Every frame height in this app was chosen by reasoning about how a provider
// designs its widget, and on 2026-08-19 every one of them was measured wrong in
// a real browser: a short tweet painted 225px of a 600px box, and an Apple
// Music album needed 450px in a 168px one. The measured numbers live in
// `EMBED_PROVIDERS` and reach the page through `ResolvedEmbed.height`; this is
// what proves they arrive, on the element that actually sizes the frame.
//
// **It asserts the SERVER-RENDERED box and nothing about the provider's own
// content**, deliberately. What a frame paints is the third party's business
// and depends on their network, their layout and their A/B tests — an
// assertion on it would be a flake wearing a measurement's clothes. The
// measurement itself is recorded once, in
// `.superpowers/sdd/embeds-that-fit/measurements.md`, and what a check can
// honestly hold to is that the number this app decided reaches the box.
//
// **The centring half genuinely needs a browser.** `mx-auto` on a capped
// figure is a class in jsdom and a pair of equal offsets only where something
// lays the page out; the unit suite can see the class and cannot see whether
// the leftover was split.

test.skip(!hasClerk(), "needs CLERK_SECRET_KEY");

const LAPTOP = { width: 1280, height: 900 };

/**
 * Stops every framed player from loading at all.
 *
 * **Nothing here asserts what a provider paints, so nothing here should wait
 * for one.** A page of ten real embeds took longer than the navigation budget
 * on its own, and every one of those requests is a third party's server
 * deciding whether this check passes — the exact shape of a flake that reads
 * as a defect. What is asserted is the height THIS app decided, which is in
 * the server's HTML before any of them answers.
 *
 * The origins come from `PLAYER_ORIGINS`, which is derived from the provider
 * table, so a provider added later is blocked here without anybody editing a
 * second list.
 *
 * @param page - the page under test.
 */
async function silenceProviders(page: Page): Promise<void> {
  for (const origin of PLAYER_ORIGINS) {
    await page.route(`${origin}/**`, (route) => route.abort());
  }
}

let identity: TestIdentity | undefined;

test.beforeAll(async () => {
  if (!hasClerk()) return;
  identity = await createTestIdentity();
});

test.afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.userId);
});

/**
 * One `player` leaf, titled so a frame can be found by its accessible name.
 *
 * @param title - the frame's title, which is also how the test finds it.
 * @param url - the address somebody pasted.
 * @returns the leaf.
 */
const player = (title: string, url: string) =>
  leaf({ kind: "embed", title_en: title, link_url: url });

/**
 * How much viewport one frame actually gets, found by its accessible name.
 *
 * **The frame and not the box around it, and the difference is the whole
 * point.** Every element here is `border-box` and the box carries the border,
 * so a height put on the box is the border's to spend first — measured in this
 * app, a 152px box handed Spotify 150px of viewport and it drew its 80px card
 * instead of its 152px one. What a provider is given is this number.
 *
 * @param page - the page under test.
 * @param title - the frame's title.
 * @returns the frame's own height in CSS pixels, rounded.
 */
async function frameHeight(page: Page, title: string): Promise<number> {
  return page
    .getByTitle(title)
    .evaluate((frame) => Math.round(frame.getBoundingClientRect().height));
}

/**
 * The height of the box around one frame.
 *
 * @param page - the page under test.
 * @param title - the frame's title.
 * @returns the box's height in CSS pixels, rounded.
 */
async function boxHeight(page: Page, title: string): Promise<number> {
  return page
    .getByTitle(title)
    .evaluate((frame) =>
      Math.round(frame.parentElement?.getBoundingClientRect().height ?? 0),
    );
}

test.describe("the height a frame is served at", () => {
  test.beforeEach(async ({ page }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "fit",
      displayName: "Fit",
      blocks: [
        container({
          name_en: "Players",
          mode: "stack",
          spaces: 1,
          children: [
            player(
              "A track",
              "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
            ),
            player(
              "An album",
              "https://open.spotify.com/album/2WlZ6L68eq4Wy7QUSI2ffK",
            ),
            player(
              "An Apple album",
              "https://music.apple.com/us/album/s/678105",
            ),
            player("An Apple song", "https://music.apple.com/us/song/s/678105"),
            player(
              "An Apple video",
              "https://music.apple.com/us/music-video/s/1744613616",
            ),
            player("A Tidal track", "https://tidal.com/track/4248"),
            player("A Tidal album", "https://tidal.com/album/35540348"),
            player(
              "A vertical video",
              "https://www.tiktok.com/@user/video/7673004910639680776",
            ),
            player("A video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            leaf({
              kind: "embed",
              title_en: "A post",
              link_url: "https://t.me/telegram/83",
            }),
          ],
        }),
      ],
    });
    await page.setViewportSize(LAPTOP);
    await silenceProviders(page);
    expect(
      (
        await page.goto(`/es/${address}/${handle}`, {
          waitUntil: "domcontentloaded",
        })
      )?.status(),
    ).toBe(200);
  });

  // EACH OF THESE WAS WATCHED IN THE PROVIDER'S OWN DOCUMENT, and each is a
  // number the frame's SHAPE could not express: Apple Music serves an album, a
  // song and a music video from one host, and Spotify and Tidal both key off
  // the kind their own address carries. One number per shape is exactly what
  // put a 450px player in a 168px box.
  test("serves every measured provider at its own measured height", async ({
    page,
  }) => {
    expect(await frameHeight(page, "A track")).toBe(152);
    expect(await frameHeight(page, "An album")).toBe(352);
    expect(await frameHeight(page, "An Apple album")).toBe(450);
    expect(await frameHeight(page, "An Apple song")).toBe(175);
    expect(await frameHeight(page, "A Tidal track")).toBe(121);
    expect(await frameHeight(page, "A vertical video")).toBe(756);
  });

  // A player that paints whatever frame it is given keeps the shape's own
  // class, and a number here would crop a scrolling list nothing was wrong
  // with. 168 is `h-42`.
  //
  // **Tidal and not a post**, deliberately: a Telegram frame reports its own
  // height about a second in and the box then stops being 600 — which is the
  // feature working, and is asserted where it can be asserted without a third
  // party's network deciding whether the check passes. See the no-JavaScript
  // describe below for the server-rendered half.
  test("leaves a provider that fills at its shape's own height", async ({
    page,
  }) => {
    expect(await boxHeight(page, "A Tidal album")).toBe(168);
  });

  // Apple's music video is the one address form whose KIND decides the shape
  // rather than the height: 16∶9 at every width measured, so a fixed number
  // would be right at exactly one of them. At the 420px cap a `post` gets and
  // the full width a video gets, those are different answers.
  test("frames an Apple music video by its aspect, not by a number", async ({
    page,
  }) => {
    const video = await page
      .getByTitle("An Apple video")
      .evaluate((frame) => frame.parentElement?.getBoundingClientRect());
    expect(video).toBeTruthy();
    expect(Math.round(video!.height)).toBe(Math.round((video!.width * 9) / 16));
  });
});

test.describe("where a frame narrower than its place sits", () => {
  // A post caps at 420px and a TikTok at 320, in a place that may be far
  // wider. Until this shipped the whole leftover went to the right, so a frame
  // in a one-space section hugged the left edge of a page that is otherwise
  // centred — a class the unit suite can read and an offset only a layout
  // engine can measure.
  test("splits the leftover evenly on both sides", async ({ page }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "centre",
      displayName: "Centre",
      blocks: [
        container({
          name_en: "Centred",
          mode: "stack",
          spaces: 1,
          children: [
            leaf({
              kind: "embed",
              title_en: "A post",
              link_url: "https://t.me/telegram/83",
            }),
            player("A video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
          ],
        }),
      ],
    });
    await page.setViewportSize(LAPTOP);
    await silenceProviders(page);
    expect(
      (
        await page.goto(`/es/${address}/${handle}`, {
          waitUntil: "domcontentloaded",
        })
      )?.status(),
    ).toBe(200);

    /**
     * How much room is left to each side of a framed figure inside its place.
     *
     * @param title - the frame's accessible name.
     * @returns the left and right gaps, and the figure's own width.
     */
    const gaps = (title: string) =>
      page.getByTitle(title).evaluate((frame) => {
        const figure = frame.closest("figure");
        const place = figure?.parentElement;
        if (!figure || !place) throw new Error("no figure in a place");
        const inner = figure.getBoundingClientRect();
        const outer = place.getBoundingClientRect();
        return {
          left: Math.round(inner.left - outer.left),
          right: Math.round(outer.right - inner.right),
          width: Math.round(inner.width),
        };
      });

    const post = await gaps("A post");
    // The cap itself has to be in force, or "the gaps are equal" is satisfied
    // by a figure that simply fills the place — a green check that cannot fail.
    expect(post.width).toBe(420);
    expect(post.left).toBeGreaterThan(0);
    expect(Math.abs(post.left - post.right)).toBeLessThanOrEqual(1);

    // And a player that takes the whole place must not be centred into a
    // narrower one: capping a video would shrink it for no reason.
    const video = await gaps("A video");
    expect(video.left).toBe(0);
    expect(video.right).toBe(0);
  });

  // A lone block on a part-filled last row is centred across the leftover,
  // where the leftover divides evenly. Three places holding four blocks is
  // that case; the empty tracks are the two beside the fourth.
  test("centres a lone block on a part-filled last row", async ({ page }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "lastrow",
      displayName: "Last row",
      blocks: [
        container({
          name_en: "Four in three",
          mode: "grid",
          spaces: 3,
          children: [
            leaf({ title_en: "One" }),
            leaf({ title_en: "Two" }),
            leaf({ title_en: "Three" }),
            leaf({ title_en: "Four" }),
          ],
        }),
      ],
    });
    await page.setViewportSize(LAPTOP);
    await silenceProviders(page);
    expect(
      (
        await page.goto(`/es/${address}/${handle}`, {
          waitUntil: "domcontentloaded",
        })
      )?.status(),
    ).toBe(200);

    const boxes = await page.getByTestId("block-grid").evaluate((grid) =>
      [...grid.children].map((place) => {
        const rect = place.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top) };
      }),
    );
    expect(boxes).toHaveLength(4);
    // The fourth is on a row of its own — that is what makes it lone.
    expect(boxes[3]!.top).toBeGreaterThan(boxes[2]!.top);
    // And it sits in the middle track rather than the first, which is where
    // auto-placement would have put it.
    expect(boxes[3]!.left).toBe(boxes[1]!.left);
  });
});

// WHAT THE SERVER RENDERS IS WHAT WORKS WITHOUT SCRIPT, and that is the whole
// reason `blocks.tsx` stayed a server component while one leaf became a client
// one. With JavaScript off nothing listens, nothing asks and nothing refines —
// so what is left has to be a frame somebody can read, never the collapsed one
// the Mastodon measuring pass uses.
test.describe("a page with no JavaScript at all", () => {
  test.use({ javaScriptEnabled: false });

  test("still frames every provider at a sensible height", async ({ page }) => {
    const { address, handle } = await seedPage({
      userId: identity!.userId,
      handlePrefix: "quiet",
      displayName: "No script",
      blocks: [
        container({
          name_en: "Quiet",
          mode: "stack",
          spaces: 1,
          children: [
            player(
              "A track",
              "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
            ),
            leaf({
              kind: "embed",
              title_en: "A post",
              link_url: "https://t.me/telegram/83",
            }),
            leaf({
              kind: "embed",
              title_en: "A status",
              link_url: "https://mastodon.social/@user/117111027223007552",
            }),
          ],
        }),
      ],
    });
    await page.setViewportSize(LAPTOP);
    await silenceProviders(page);
    expect(
      (
        await page.goto(`/es/${address}/${handle}`, {
          waitUntil: "domcontentloaded",
        })
      )?.status(),
    ).toBe(200);

    // The measured constant is server-rendered, so a provider that says
    // nothing is right here as well as everywhere else.
    expect(await frameHeight(page, "A track")).toBe(152);
    // And a provider that would have reported one keeps the shape's own
    // height rather than whatever the refinement would have collapsed it to.
    expect(await boxHeight(page, "A post")).toBe(600);
    expect(await boxHeight(page, "A status")).toBe(600);

    // The Mastodon frame in particular must NOT be the one-pixel measuring
    // state: that state exists only in an effect, and rendering it on the
    // server is the one way this feature could hide a post entirely.
    //
    // The frame fills its box rather than measuring the same as it — the box
    // is 600 including its own border, and the frame is the content inside —
    // so what is asserted is the fill, which is exactly the property the
    // measuring state replaces.
    await expect(page.getByTitle("A status")).toHaveCSS("height", "598px");
  });
});
