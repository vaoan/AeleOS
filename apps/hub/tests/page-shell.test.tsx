import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { SKIN_SCOPE } from "@/shared/domain/skins";

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
async function renderShell(
  width?: "column" | "wide" | "full",
): Promise<HTMLElement> {
  render(await PageShell({ children: <p>hi</p>, width }));
  return screen.getByTestId("page-content");
}

describe("PageShell width", () => {
  // **THE REGRESSION TEST for a style that styles nothing.** A skin is emitted
  // as a rule scoped to this class, so an element that does not wear it means
  // somebody picks a style, the stylesheet updates, and the page does not move
  // — with nothing anywhere to tell them why. That exact fault has happened
  // once already, and every test of the rule passed throughout it, because the
  // rule was never the thing that was wrong.
  //
  // It is asserted on `PageShell` rather than on each page: the class is set
  // here so that a new page cannot forget it.
  it("wears the class a skin is scoped to", async () => {
    const main = await renderShell();
    expect(main.className.split(/\s+/)).toContain(SKIN_SCOPE);
  });

  // The other half. A skin stops at this element, so the header must be OUTSIDE
  // it: the language and theme toggles live up there, and a control that
  // changes shape on somebody else's page is harder to recognise as one.
  it("leaves the app's own bar outside it", async () => {
    const main = await renderShell();
    expect(main.querySelector("header")).toBeNull();
  });
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

  it("leaves vertical page chrome to sections when full", async () => {
    const classes = (await renderShell("full")).className.split(/\s+/);
    expect(classes).not.toContain("py-6");
    expect(classes).not.toContain("sm:py-10");
  });
});

// **The way out of an author's theme lives in the BAR now.** It rode the
// public profile's header until that header became blocks — that was the one
// row the app owned inside somebody's content, and a control belonging to the
// app is exactly what should not sit among an author's blocks.
describe("the page theme switch", () => {
  it("renders among the page settings when there is a theme to leave", async () => {
    render(
      await PageShell({
        children: <p>hi</p>,
        pageThemeSwitch: <button type="button">leave</button>,
      }),
    );
    expect(screen.getByTestId("public-theme-switch")).toBeInTheDocument();
  });

  // **Absent, not an empty box.** A page nobody themed offers no way out of a
  // theme it does not have, and a wrapper rendered anyway would put a gap in
  // the control row of every signed-in page in the app.
  it("leaves nothing behind on a page with no theme of its own", async () => {
    render(await PageShell({ children: <p>hi</p> }));
    expect(screen.queryByTestId("public-theme-switch")).not.toBeInTheDocument();
  });

  // It sits INSIDE the bar rather than in the content column, which is what
  // keeps it out of `SKIN_SCOPE` — an author's skin must not restyle the
  // control that escapes their theme.
  it("sits in the bar, outside the skin's scope", async () => {
    const { container } = render(
      await PageShell({
        children: <p>hi</p>,
        pageThemeSwitch: <button type="button">leave</button>,
      }),
    );
    const control = screen.getByTestId("public-theme-switch");
    expect(container.querySelector("header")).toContainElement(control);
    expect(container.querySelector("main")).not.toContainElement(control);
  });
});
