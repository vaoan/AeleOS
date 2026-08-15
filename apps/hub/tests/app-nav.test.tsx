import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

let pathname = "/me";

// The locale-aware navigation, not next/navigation's: `usePathname` here
// returns the path with the locale prefix already stripped, which is what makes
// the active-state comparisons below locale-independent.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
}));

const { AppNav } = await import("@/shared/presentation/app-nav");

const labels = { ariaLabel: "Sections", me: "Me", pages: "Pages" };

/**
 * Renders the nav as if the person were on the given path.
 *
 * @param at - the locale-stripped pathname.
 */
function renderAt(at: string): void {
  pathname = at;
  render(<AppNav labels={labels} />);
}

describe("AppNav", () => {
  it("offers both sections", () => {
    renderAt("/me");
    expect(screen.getByRole("link", { name: "Me" })).toHaveAttribute(
      "href",
      "/me",
    );
    expect(screen.getByRole("link", { name: "Pages" })).toHaveAttribute(
      "href",
      "/pages",
    );
  });

  it("marks the section you are on", () => {
    renderAt("/me");
    expect(screen.getByRole("link", { name: "Me" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Pages" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  // The reason the match is a prefix and not equality. These are the pages that
  // answer "where am I" with nothing today, so they are the ones that most need
  // the section lit.
  it.each(["/pages", "/pages/new", "/pages/sparky/edit"])(
    "keeps Pages marked on %s",
    (at) => {
      renderAt(at);
      expect(screen.getByRole("link", { name: "Pages" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    },
  );

  // `/me` is matched exactly, so a future `/mementos` would not light it up.
  it("does not mark Me on a path that merely starts with it", () => {
    renderAt("/mementos");
    expect(screen.getByRole("link", { name: "Me" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  // The picker is a handoff another app sent someone into. Nav links there
  // invite wandering off mid-flow and abandoning the return_to; the page has
  // its own decline path as the way out, and that is the only way out it should
  // offer.
  it("renders nothing on the picker", () => {
    renderAt("/picker");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
