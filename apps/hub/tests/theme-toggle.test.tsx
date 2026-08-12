import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";

const LABELS = {
  toDarkLabel: "Switch to dark mode",
  toLightLabel: "Switch to light mode",
};

beforeEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
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
