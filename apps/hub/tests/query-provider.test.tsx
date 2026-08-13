import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { QueryProvider } from "@/shared/presentation/query-provider";

/** Renders the client's presence as text, so the assertion is on behaviour. */
function Probe() {
  return <span>{useQueryClient() ? "has client" : "no client"}</span>;
}

describe("QueryProvider", () => {
  it("renders its children", () => {
    render(
      <QueryProvider>
        <p>hello</p>
      </QueryProvider>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("puts a query client in context for the tree below it", () => {
    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    expect(screen.getByText("has client")).toBeInTheDocument();
  });

  // One client for the life of the tree. Constructing it in the render body
  // makes a new client on every render, which throws away every cached query —
  // the bug this test exists to prevent, and one that shows up as a cache that
  // never hits rather than as an error.
  it("keeps the same client across re-renders", () => {
    const seen: unknown[] = [];
    function Collect() {
      seen.push(useQueryClient());
      return null;
    }
    const { rerender } = render(
      <QueryProvider>
        <Collect />
      </QueryProvider>,
    );
    rerender(
      <QueryProvider>
        <Collect />
      </QueryProvider>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });
});
