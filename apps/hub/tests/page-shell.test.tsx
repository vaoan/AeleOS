import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/shared/presentation/nebula-toggle", () => ({
  NebulaToggle: () => null,
}));
vi.mock("@/shared/presentation/language-toggle", () => ({
  LanguageToggle: () => null,
}));
vi.mock("@/shared/presentation/theme-toggle", () => ({
  ThemeToggle: () => null,
}));

const { PageShell } = await import("@/shared/presentation/page-shell");

/**
 * Renders the shell and returns its main element.
 *
 * The shell is an async server component, so it is awaited and its result
 * rendered rather than being mounted as a component.
 *
 * @param width - the width mode, omitted to exercise the default.
 * @returns the rendered main element.
 */
async function renderShell(width?: "column" | "wide"): Promise<HTMLElement> {
  render(await PageShell({ children: <p>hi</p>, width }));
  return screen.getByTestId("page-content");
}

describe("PageShell width", () => {
  it("holds the page to the reading column by default", async () => {
    const main = await renderShell();
    expect(main.className).toContain("max-w-[620px]");
  });

  // A short card centres in the window; a long table must not, or it starts
  // below the fold on a tall screen.
  it("centres a short page vertically in the column", async () => {
    const main = await renderShell();
    expect(main.className).toContain("justify-center");
  });

  it("goes wide when asked", async () => {
    const main = await renderShell("wide");
    expect(main.className).toContain("max-w-7xl");
    expect(main.className).not.toContain("max-w-[620px]");
  });

  it("starts a wide page at the top rather than centring it", async () => {
    const main = await renderShell("wide");
    expect(main.className).not.toContain("justify-center");
  });
});
