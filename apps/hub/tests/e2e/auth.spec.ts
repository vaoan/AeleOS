import { expect, test } from "@playwright/test";

// None of these need credentials: they exercise the gate, not a completed
// sign-in. Driving Google's, Discord's or Facebook's own login would be
// brittle and outside our control, so that path stays the manual check in
// Task 7 Step 6 of the plan.
test.describe("authentication gate", () => {
  test("the home page is public", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AeleOS" })).toBeVisible();
  });

  test("an anonymous visitor cannot reach /me", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/sign-in/);
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
