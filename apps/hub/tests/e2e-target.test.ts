import { describe, expect, it } from "vitest";
import { e2eTarget } from "../e2e-target";

describe("e2eTarget", () => {
  it("defaults to the local dev server and asks for it to be started", () => {
    expect(e2eTarget({})).toEqual({
      baseURL: "http://localhost:5100",
      startsServer: true,
    });
  });

  it("targets a deployed URL and does not start a server", () => {
    expect(
      e2eTarget({ PLAYWRIGHT_BASE_URL: "https://me.furrycolombia.com" }),
    ).toEqual({
      baseURL: "https://me.furrycolombia.com",
      startsServer: false,
    });
  });

  // An empty or whitespace variable is what a misconfigured CI job produces.
  // Treating it as a deployed target would run the suite against nothing and
  // report a confusing connection error instead of falling back.
  it("ignores an empty variable rather than targeting nothing", () => {
    expect(e2eTarget({ PLAYWRIGHT_BASE_URL: "   " })).toEqual({
      baseURL: "http://localhost:5100",
      startsServer: true,
    });
  });

  it("strips a trailing slash so page.goto('/me') does not double it", () => {
    expect(
      e2eTarget({ PLAYWRIGHT_BASE_URL: "https://me.furrycolombia.com/" })
        .baseURL,
    ).toBe("https://me.furrycolombia.com");
  });
});
