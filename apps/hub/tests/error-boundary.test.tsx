import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppError from "@/app/(app)/error";

const dbFailure = Object.assign(
  new Error("permission denied for view actors_public"),
  { digest: "abc123" },
);

describe("the signed-in error boundary", () => {
  it("says the identity could not be loaded rather than rendering a blank one", () => {
    render(<AppError error={dbFailure} reset={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/could not load your identity/i)).toBeVisible();
  });

  it("offers a retry that re-runs the failed render", async () => {
    const reset = vi.fn();
    render(<AppError error={dbFailure} reset={reset} />);
    screen.getByRole("button", { name: /try again/i }).click();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The message can carry schema names, policy names and connection strings.
  // Support needs the digest; the person signing in does not need the rest.
  it("does not leak the underlying database error to the person", () => {
    render(<AppError error={dbFailure} reset={vi.fn()} />);
    expect(
      screen.queryByText(/permission denied for view actors_public/i),
    ).toBeNull();
    expect(screen.getByText(/abc123/)).toBeVisible();
  });
});
