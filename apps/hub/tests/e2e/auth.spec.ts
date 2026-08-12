import { expect, test } from "@playwright/test";

// None of these need credentials: they exercise the gate, not a completed
// sign-in. Driving Google's, Discord's or Facebook's own login would be
// brittle and outside our control, so that path stays a manual check.
test.describe("authentication gate", () => {
  test("the home page is public", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AeleOS" })).toBeVisible();
  });

  test("an anonymous visitor cannot reach /me", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/(es|en)\/sign-in/);
  });

  test("the sign-in page offers the configured social providers", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    // Clerk renders social buttons with the provider name in the accessible name.
    await expect(page.getByRole("button", { name: /google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /discord/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /facebook/i })).toBeVisible();
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
    await expect(page.getByText(/One account for every app/i)).toBeVisible();
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
  test("an unknown locale on a protected route sends you to sign in", async ({
    page,
  }) => {
    await page.goto("/fr/me");
    await expect(page).toHaveURL(/\/es\/sign-in$/);
  });
});

test.describe("the visual identity", () => {
  test("the star meets the minimum target size", async ({ page }) => {
    await page.goto("/");
    const box = await page
      .getByRole("button", { name: /nebula|nebulosa/i })
      .boundingBox();
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
  test("the nebula actually paints", async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1200);
    const painted = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const data = canvas
        ?.getContext("2d")
        ?.getImageData(0, 0, 400, 400)
        .data.filter((_, i) => i % 4 === 3);
      if (!data) return -1;
      let visible = 0;
      for (const alpha of data) if (alpha > 6) visible++;
      return (visible / data.length) * 100;
    });
    expect(painted).toBeGreaterThan(15);
    expect(painted).toBeLessThan(95);
  });

  test("switching the star off leaves the page readable", async ({ page }) => {
    await page.goto("/");
    const star = page.getByRole("button", { name: /nebula|nebulosa/i });
    await star.click();
    await expect(star).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "AeleOS" })).toBeVisible();
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
