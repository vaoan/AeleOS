import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageThemeSwitch } from "@/shared/presentation/page-theme-switch";
import { PAGE_THEME_ATTRIBUTE } from "@/shared/application/page-theme";

const labels = {
  title: "How this page looks",
  author: "Their theme",
  light: "Light",
  dark: "Dark",
};

afterEach(() => {
  document.documentElement.removeAttribute(PAGE_THEME_ATTRIBUTE);
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

describe("PageThemeSwitch", () => {
  it("offers all three", () => {
    render(<PageThemeSwitch labels={labels} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  // What a visitor arrives to, and what the pre-paint script defaults to.
  it("starts on the author's theme", () => {
    render(<PageThemeSwitch labels={labels} />);
    expect(screen.getByTitle("Their theme")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  // Choosing a default does two things at once: takes the author's theme off,
  // and names which default replaces it. Doing only the first would leave the
  // page on whichever scheme the visitor last happened to be in.
  it.each([
    ["Light", "light"],
    ["Dark", "dark"],
  ])(
    "switching to %s leaves the theme and picks that default",
    (name, theme) => {
      render(<PageThemeSwitch labels={labels} />);
      fireEvent.click(screen.getByTitle(name));
      expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
        "default",
      );
      expect(document.documentElement.dataset.theme).toBe(theme);
    },
  );

  it("switching back puts the author's theme on again", () => {
    render(<PageThemeSwitch labels={labels} />);
    fireEvent.click(screen.getByTitle("Dark"));
    fireEvent.click(screen.getByTitle("Their theme"));
    expect(document.documentElement.getAttribute(PAGE_THEME_ATTRIBUTE)).toBe(
      "author",
    );
  });

  // It reads the document rather than holding its own state, so a change made
  // anywhere — the app's own toggle, another tab — is reflected here.
  it("follows a change it did not make", () => {
    render(<PageThemeSwitch labels={labels} />);
    fireEvent.click(screen.getByTitle("Light"));
    expect(screen.getByTitle("Light")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTitle("Their theme")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
