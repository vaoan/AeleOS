import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageContent } from "@/shared/presentation/page-content";
import { SKIN_SCOPE } from "@/shared/domain/skins";

describe("PageContent", () => {
  it("is the skin scope and carries the page-content marker", () => {
    render(
      <PageContent width="full">
        <div data-testid="child" />
      </PageContent>,
    );

    const main = screen.getByTestId("page-content");
    expect(main.tagName).toBe("MAIN");
    expect(main).toHaveClass(SKIN_SCOPE);
    expect(main).toContainElement(screen.getByTestId("child"));
  });

  // `full` is what a public page and the preview document both ask for, and
  // it must hold NOTHING back: each depth-0 section owns its own measure and
  // its first/between/last spacing. A column here would cap the two widest
  // measures and stop a bled section reaching either edge — which is exactly
  // what shipped once, behind a `COLUMN.full` that existed and had no caller.
  it("holds nothing back at full width", () => {
    render(<PageContent width="full">{null}</PageContent>);

    const main = screen.getByTestId("page-content");
    expect(main).not.toHaveClass("max-w-7xl");
    expect(main).not.toHaveClass("mx-auto");
    expect(main.className).not.toMatch(/\bp[xy]-/);
  });

  it("takes the wide column when asked", () => {
    render(<PageContent width="wide">{null}</PageContent>);
    expect(screen.getByTestId("page-content")).toHaveClass("max-w-7xl");
  });

  it("takes the reading column when asked", () => {
    render(<PageContent width="column">{null}</PageContent>);
    expect(screen.getByTestId("page-content")).toHaveClass("max-w-[620px]");
  });
});
