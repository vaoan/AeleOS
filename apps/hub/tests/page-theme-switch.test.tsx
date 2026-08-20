import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import {
  PAGE_THEME_ATTRIBUTE,
  PAGE_THEME_CHANGE_EVENT,
} from "@/shared/application/page-theme";

const labels = { author: "Their theme" };

afterEach(() => {
  document.documentElement.removeAttribute(PAGE_THEME_ATTRIBUTE);
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

/**
 * **This suite shrank when the control did, and the cases moved rather than
 * went.** It was a group of three — the author's theme, light and dark —
 * which made sense while it sat inside the page and was the only way to reach
 * any of them. It lives in the bar now, beside the light/dark toggle, and two
 * controls both offering light and dark is one too many.
 *
 * So this asks one question and the toggle beside it asks the other. The two
 * cases about choosing a default moved to `theme-toggle.test.tsx`, where the
 * control that now does it lives — including the one that matters, that
 * pressing it takes the author's theme off rather than only naming a default.
 */
describe("PageThemeSwitch", () => {
  it("offers one control, not a group", () => {
    render(<PageThemeSwitch labels={labels} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  // **Pressed by default**, matching the pre-paint script, which leaves the
  // attribute absent for a page whose author's theme is in force. Rendering
  // it un-pressed on the server would flip on hydration.
  it("starts pressed, wearing the author's theme", () => {
    render(<PageThemeSwitch labels={labels} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("takes the theme off when pressed", () => {
    render(<PageThemeSwitch labels={labels} />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "default",
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  // **It is a toggle, so it has to come back.** A one-way control would leave
  // a visitor who pressed it by accident with no way to see the page as its
  // owner built it — and the escape hatch existing in both directions is what
  // lets an author's colours be as unreadable as they like.
  it("puts it back on when pressed again", () => {
    render(<PageThemeSwitch labels={labels} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    expect(
      document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE),
    ).not.toBe("default");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  // The light/dark toggle beside it writes the same attribute, so this must
  // follow a change it did not make — otherwise the two controls in one bar
  // would disagree about what the page is wearing.
  it("follows a change it did not make", () => {
    render(<PageThemeSwitch labels={labels} />);
    document.documentElement.setAttribute(PAGE_THEME_ATTRIBUTE, "default");
    fireEvent(window, new Event(PAGE_THEME_CHANGE_EVENT));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});
