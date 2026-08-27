import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

// **The question mark is gone, and these cases went with it — replaced, not
// dropped.** The toggle used to show one on a themed page, because neither the
// sun nor the moon was true there. A themed page now has a palette toggle of
// its own beside this control, so this one only ever names a direction again
// and the three cases that asserted the question mark have nothing to assert.
//
// What replaced them is the case below: pressing this takes an author's theme
// OFF as well as setting the default. That is what stops the press being one
// that changes nothing a visitor can see, which is why the question mark
// existed in the first place.
describe("ThemeToggle on a page wearing its author's theme", () => {
  it("names a direction, never the author", () => {
    document.documentElement.setAttribute("data-page-theme", "author");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  // **Both attributes, and the page-theme one is what matters here.** Setting
  // only `data-theme` would leave the author's colours in force, so the press
  // would change the stored default and nothing a visitor can see.
  it("takes the author's theme off when pressed", () => {
    document.documentElement.setAttribute("data-page-theme", "author");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} clearsPageTheme />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-page-theme")).toBe(
      "default",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  // **THE REGRESSION TEST for an editor that threw the page away.** Clearing is
  // licensed by the way back — the page-theme switch `PageShell` renders beside
  // this control on a public page and nowhere else. The editor themes its own
  // document with the draft now, so a toggle that cleared there would discard
  // the page somebody is building, with nothing in the signed-in bar to restore
  // it. The press still changes what they see: every control is a
  // `CHROME_SCOPE` island following the light/dark choice.
  it("leaves the author's theme alone where there is no way back", () => {
    document.documentElement.setAttribute("data-page-theme", "author");
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle {...LABELS} />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.getAttribute("data-page-theme")).toBe(
      "author",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
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
