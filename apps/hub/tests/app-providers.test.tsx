import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { parseAsString, useQueryStates } from "nuqs";

const { AppProviders } = await import("@/shared/presentation/app-providers");

/**
 * Reads URL state through the real nuqs, with nothing stubbed.
 *
 * @returns nothing rendered; the render itself is what is being tested.
 */
function UrlStateProbe() {
  useQueryStates({ q: parseAsString.withDefault("") });
  return null;
}

/**
 * Reports whether a query client reached it.
 *
 * @returns the answer, on screen.
 */
function QueryProbe() {
  return <span>{useQueryClient() ? "has client" : "no client"}</span>;
}

/**
 * Renders a tree inside the providers and returns whatever it threw.
 *
 * @param children - the tree to render.
 * @returns the error message, or "" when it rendered.
 */
function renderFor(children: React.ReactNode): string {
  try {
    render(<AppProviders>{children}</AppProviders>);
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("AppProviders", () => {
  it("renders its children", () => {
    render(
      <AppProviders>
        <p>hello</p>
      </AppProviders>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("provides a query client", () => {
    render(
      <AppProviders>
        <QueryProbe />
      </AppProviders>,
    );
    expect(screen.getByText("has client")).toBeInTheDocument();
  });

  // THE REGRESSION. `nuqs` is deliberately not mocked here, and this is the
  // only suite in which it is not — every other one stubs it, which is exactly
  // why a missing adapter reached production. Phase 2b shipped `useQueryStates`
  // with no `NuqsAdapter` mounted, so `/fursonas` threw on render and the
  // signed-in error boundary reported it as "we could not load your identity".
  //
  // The assertion is on the message rather than on a clean render, and the
  // distinction is the whole point. Without an adapter, nuqs throws "requires
  // an adapter". WITH one, it gets further and trips over jsdom having no Next
  // router — a different failure, and not one a browser ever sees. Asserting
  // "renders cleanly" would be asserting that jsdom is a browser; asserting
  // this message is absent is asserting precisely the bug is gone.
  it("mounts the nuqs adapter, so URL state never fails for want of one", () => {
    expect(renderFor(<UrlStateProbe />)).not.toMatch(/requires an adapter/i);
  });
});
