import { expect, test } from "@playwright/test";
import {
  movesWithin,
  nebulaAlpha,
  nebulaTint,
  waitForNebulaReady,
} from "./helpers";

// None of these need credentials: they exercise the gate, not a completed
// sign-in. Driving Google's, Discord's or Facebook's own login would be
// brittle and outside our control, so that path stays a manual check.
test.describe("authentication gate", () => {
  test("the home page is public", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("home-title")).toBeVisible();
  });

  test("an anonymous visitor cannot reach /me", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/(es|en)\/sign-in/);
  });

  // Clerk's default when it is not told where our sign-in page is: its own
  // hosted Account Portal on accounts.dev. CLAUDE.md forbids anyone landing on
  // a Clerk-branded address, and both the proxy and the signed-in layout have
  // had to be corrected for exactly this.
  test("the sign-in redirect never leaves our origin", async ({
    page,
    baseURL,
  }) => {
    const ours = new URL(baseURL!).origin;
    for (const path of ["/me", "/es/me", "/en/me"]) {
      await page.goto(path);
      expect(new URL(page.url()).origin).toBe(ours);
    }
  });

  test("the sign-in page offers the configured social providers", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    // Our own markup now, so these are test ids rather than Clerk's classes.
    for (const provider of ["discord", "google", "facebook"]) {
      await expect(page.getByTestId(`sign-in-${provider}`)).toBeVisible();
    }
  });

  // The sign-in page used to be Clerk's <SignIn/>, which renders an email
  // field, a password path and a sign-up link. This product has none of those:
  // it is social-login-first with no passwords, and offering a password box
  // that cannot work is worse than offering nothing.
  test("the sign-in page offers no password or email path", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByTestId("sign-in-discord")).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.locator('[class*="cl-"]')).toHaveCount(0);
  });

  // Tailwind v4's Preflight drops the pointer cursor browsers give buttons, so
  // every button in the app rendered with an arrow. It is invisible in a
  // screenshot and obvious the moment you use the page.
  test("every button shows a pointer cursor", async ({ page }) => {
    await page.goto("/sign-in");
    const cursors = await page
      .locator("button")
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el as HTMLElement).cursor),
      );
    expect(cursors.length).toBeGreaterThan(0);
    expect(cursors.every((cursor) => cursor === "pointer")).toBe(true);
  });
});

test.describe("locale routing", () => {
  test("an unprefixed URL redirects to a locale", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(es|en)$/);
  });

  test.use({ locale: "en-US" });

  test("an English browser gets English", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Which words appear is the catalogue's business; that the copy rendered
    // at all is this test's.
    await expect(page.getByTestId("home-body")).toBeVisible();
    await expect(page.getByTestId("home-body")).not.toBeEmpty();
  });
});

test.describe("Spanish is the fallback", () => {
  test.use({ locale: "fr-FR" });

  // The rule is browser language when we have it, Spanish when we do not —
  // not English, which is what next-intl's own default would have given.
  test("an unsupported browser language falls back to Spanish", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/es$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  // The auth gate runs before the locale layout, so an anonymous visitor is
  // redirected rather than shown a 404. That ordering is deliberate: it also
  // means an unknown locale cannot be used to probe which routes exist.
  //
  // The layout's `notFound()` is the second line of defence, reached once a
  // session exists. Both matter; only this one is reachable without
  // credentials.
  //
  // The sign-in URL now carries a `redirect_url` — the destination is kept
  // across sign-in so a visitor lands where they were headed. This assertion
  // used to be anchored with `$` and went red when that shipped; it is written
  // against the parts that are the contract instead. Where an *unknown* locale
  // is sent back to is intentionally left open: it is `/fr/me` today, and
  // `resolveAfterSignInUrl` hands it to the layout's `notFound()` rather than
  // to a page, which is the second line of defence doing its job.
  test("an unknown locale on a protected route sends you to sign in", async ({
    page,
  }) => {
    await page.goto("/fr/me");
    await expect(page).toHaveURL(/\/es\/sign-in\?/);
    await expect(page.getByTestId("sign-in-discord")).toBeVisible();
  });
});

test.describe("the header controls", () => {
  test("the theme switch flips the document and persists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.getByTestId("theme-toggle").click();
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.reload();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  // The root layout sits above the [locale] segment, so Next does not
  // re-render it on a client navigation between locales. Without the syncer
  // the URL and the copy turned English while the document still declared
  // Spanish — the wrong-language bug, by a different route.
  test("the language switch changes the URL, the copy and the lang attribute", async ({
    page,
  }) => {
    await page.goto("/es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.getByTestId("language-toggle").click();
    await page.waitForURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("home-body")).not.toBeEmpty();
  });

  test("the language switch keeps you on the same page", async ({ page }) => {
    await page.goto("/es/sign-in");
    await page.getByTestId("language-toggle").click();
    await page.waitForURL(/\/en\/sign-in$/);
    await expect(page.getByTestId("sign-in-discord")).toBeVisible();
  });

  // Two independent settings; changing one must not reset the other.
  test("theme survives a language change", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/es");
    await page.getByTestId("theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByTestId("language-toggle").click();
    await page.waitForURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test.describe("the visual identity", () => {
  test("the star meets the minimum target size", async ({ page }) => {
    await page.goto("/");
    const box = await page.getByTestId("nebula-toggle").boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });

  test("the nebula canvas fills the viewport rather than its intrinsic size", async ({
    page,
  }) => {
    await page.goto("/");
    const size = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return canvas ? { w: canvas.width, h: canvas.height } : null;
    });
    // 300x150 is the intrinsic default of a replaced element: `inset-0`
    // stretches the CSS box and leaves the bitmap alone. This is the bug.
    expect(size).not.toEqual({ w: 300, h: 150 });
    expect(size?.w).toBeGreaterThan(400);
  });

  // Neither blank nor a solid sheet, measured on the real compositing path
  // rather than on the tile in isolation.
  //
  // Structure is the invariant, not the amount. How dense the field is, is a
  // design choice that has already moved once — from a 44% haze to an 89%
  // storm — so the count of distinct alpha levels is what actually
  // distinguishes dust from a flat wash, and it holds at any density.
  test("the nebula paints structure, not a flat wash", async ({ page }) => {
    await page.goto("/");
    await waitForNebulaReady(page);
    const field = await page.evaluate(() => {
      const data = document
        .querySelector("canvas")
        ?.getContext("2d")
        ?.getImageData(0, 0, 400, 400)
        .data.filter((_, i) => i % 4 === 3);
      if (!data) return null;
      let visible = 0;
      const levels = new Set<number>();
      for (const alpha of data) {
        if (alpha > 6) visible++;
        levels.add(alpha);
      }
      return { painted: (visible / data.length) * 100, levels: levels.size };
    });
    expect(field!.painted).toBeGreaterThan(15);
    expect(field!.painted).toBeLessThan(99);
    // A solid sheet has one level; a real field has scores of them.
    expect(field!.levels).toBeGreaterThan(40);
  });

  // A frozen animation is invisible in a screenshot: the page still looks
  // exactly right. Only comparing two moments can tell the difference, and
  // nothing did until this test.
  test("the nebula actually drifts", async ({ page }) => {
    await page.goto("/");
    await waitForNebulaReady(page);
    expect(await movesWithin(page, 180)).toBe(true);
  });

  // Keeps the layer, drops the movement. Removing it entirely would hand a
  // plainer product to somebody who asked only for less motion.
  //
  // `emulateMedia` rather than `test.use`: nested inside a describe, the
  // fixture is silently not applied — matchMedia reports false — so this test
  // spent its first version exercising the animated nebula and failing for the
  // right reason by accident.
  test("reduced motion renders a static nebula rather than none", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    ).toBe(true);

    await waitForNebulaReady(page);
    expect(await nebulaAlpha(page)).toBeGreaterThan(0);
    // Given the same number of frames in which the animated field moves.
    expect(await movesWithin(page, 180)).toBe(false);
  });

  // The tints live in CSS, so the tiles have to be rebuilt when the theme
  // changes. Without the observer the clouds keep the old mode's colour —
  // hydrogen pink on a rose-gold field.
  test("the nebula re-tints when the theme changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await waitForNebulaReady(page);

    const light = await nebulaTint(page);
    // Light absorbs: solar orange, so red far exceeds blue.
    expect(light!.r).toBeGreaterThan(light!.b);

    await page.evaluate(() =>
      document.documentElement.setAttribute("data-theme", "dark"),
    );
    // Waits for the rebuild rather than assuming a duration for it.
    await page.waitForFunction((was) => {
      const data = document
        .querySelector("canvas")
        ?.getContext("2d")
        ?.getImageData(0, 0, 250, 250).data;
      if (!data) return false;
      let b = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 5) {
          b += data[i + 2]!;
          n++;
        }
      }
      return n > 0 && b / n > was + 40;
    }, light!.b);

    // Dark emits: hydrogen pink, so blue climbs well past where it was.
    const dark = await nebulaTint(page);
    expect(dark!.b).toBeGreaterThan(light!.b + 40);
  });

  test("switching the star off leaves the page readable", async ({ page }) => {
    await page.goto("/");
    const star = page.getByTestId("nebula-toggle");
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByTestId("home-title")).toBeVisible();
  });

  // Dropping `variable:` from a next/font call makes every face silently fall
  // back to system-ui. It cannot be caught in unit tests, because next/font is
  // a build-time transform.
  test("the self-hosted fonts are actually applied", async ({ page }) => {
    await page.goto("/");
    const fonts = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        sans: styles.getPropertyValue("--font-sans").trim(),
        display: styles.getPropertyValue("--font-display").trim(),
        mono: styles.getPropertyValue("--font-mono").trim(),
      };
    });
    expect(fonts.sans).toContain("DM Sans");
    expect(fonts.display).toContain("Space Grotesk");
    expect(fonts.mono).toContain("JetBrains Mono");
  });

  test("the theme is applied before hydration, not after", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-theme",
      /^(light|dark)$/,
    );
  });
});
