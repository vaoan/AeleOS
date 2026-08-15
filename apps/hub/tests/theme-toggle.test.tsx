import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/shared/presentation/theme-toggle";

const LABELS = {
  toDarkLabel: "Switch to dark mode",
  toLightLabel: "Switch to light mode",
  authorLabel: "Their own theme",
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
});

beforeEach(() => {
  // **These cases are all about the light/dark pair**, and that pair only
  // shows once the visitor has left the author's theme — on a themed page the
  // control is a question mark, because neither is in force. The attribute is
  // set for every page by the pre-paint script, so a test that wants the sun
  // or the moon has to say so.
  document.documentElement.setAttribute("data-page-theme", "default");
});

describe("ThemeToggle", () => {
  // The name says what pressing will do, not what the page currently is. A
  // control that announces its state reads as a status, not a button.
  it("names the theme it will switch to", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("names the other direction when the page is already dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle {...LABELS} />);
    expect(
      screen.getByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("switches the document theme when pressed", () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    screen.getByRole("button").click();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("remembers the choice", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle {...LABELS} />);
    screen.getByRole("button").click();
    expect(localStorage.getItem("aeleos-theme")).toBe("light");
  });

  // The control re-reads the document through a MutationObserver, whose
  // callback is a microtask — so the new name arrives after the click, not
  // during it. Asserting synchronously here passes only by accident.
  it("updates its own name after switching", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    screen.getByRole("button").click();
    expect(
      await screen.findByRole("button", { name: "Switch to light mode" }),
    ).toBeInTheDocument();
  });

  it("is a real button carrying the test id", () => {
    render(<ThemeToggle {...LABELS} />);
    const button = screen.getByTestId("theme-toggle");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });
});

describe("ThemeToggle on a page wearing its author's theme", () => {
  // **Neither the sun nor the moon is true there.** The colours belong to
  // whoever built the page, so a control promising to "switch to dark" is
  // describing a state the page is not in — and a destination it will not
  // reach until the visitor leaves the theme first.
  it("says whose theme it is instead of naming a direction", () => {
    document.documentElement.setAttribute("data-page-theme", "author");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} themed />);
    expect(
      screen.getByRole("button", { name: "Their own theme" }),
    ).toBeInTheDocument();
  });

  // Matching the ABSENCE of the attribute as well as "author" is what gives a
  // visitor with no JavaScript the author's theme — the same rule `themeCss`
  // follows, and the icon has to agree with it.
  it("says the same when the attribute was never set", () => {
    document.documentElement.removeAttribute("data-page-theme");
    render(<ThemeToggle {...LABELS} themed />);
    expect(
      screen.getByRole("button", { name: "Their own theme" }),
    ).toBeInTheDocument();
  });

  it("goes back to naming a direction once the visitor leaves the theme", () => {
    document.documentElement.setAttribute("data-page-theme", "default");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} themed />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });
});

describe("ThemeToggle on a page with no theme of its own", () => {
  // **The attribute alone is not enough, and this is the case that proves it.**
  // The pre-paint script sets `data-page-theme` on EVERY page, so reading it by
  // itself put a question mark on the signed-in pages — where the design's own
  // colours are in force and light and dark mean exactly what they say.
  it("names a direction, whatever the page-theme attribute says", () => {
    document.documentElement.setAttribute("data-page-theme", "author");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });
});
