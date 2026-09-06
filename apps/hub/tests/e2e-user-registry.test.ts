import { beforeEach, describe, expect, it, vi } from "vitest";

// `clerk-session.ts` is real Clerk-backed infrastructure — it reads
// `CLERK_SECRET_KEY` and makes network calls. Mocking it here is what lets
// this suite exercise the registry's own logic (including its default
// deleter) without a live Clerk instance or a real user leaking anywhere.
vi.mock("./e2e/support/clerk-session", () => ({
  deleteTestIdentity: vi.fn().mockResolvedValue(undefined),
}));

import { deleteTestIdentity } from "./e2e/support/clerk-session";
import {
  drainTestIdentities,
  listRegisteredTestIdentities,
  registerTestIdentity,
} from "./e2e/support/user-registry";

const mockedDelete = vi.mocked(deleteTestIdentity);

describe("user-registry", () => {
  beforeEach(async () => {
    // The registry is module-level state shared across every test in this
    // file (and, in a real run, across every spec in a worker) — drain
    // whatever a previous test left behind so each case starts from empty.
    await drainTestIdentities();
    mockedDelete.mockClear();
  });

  it("starts empty until something registers", () => {
    expect(listRegisteredTestIdentities()).toEqual([]);
  });

  it("registers a Clerk user id for later drain", () => {
    registerTestIdentity("user_1");
    expect(listRegisteredTestIdentities()).toEqual(["user_1"]);
  });

  it("drain returns zero and calls nothing when the registry is empty", async () => {
    const deleter = vi.fn();
    const count = await drainTestIdentities({ deleter });
    expect(count).toBe(0);
    expect(deleter).not.toHaveBeenCalled();
  });

  it("drain deletes every registered identity, in order, and empties the registry", async () => {
    registerTestIdentity("user_1");
    registerTestIdentity("user_2");
    const deleter = vi.fn().mockResolvedValue(undefined);

    const count = await drainTestIdentities({ deleter });

    expect(count).toBe(2);
    expect(deleter).toHaveBeenNthCalledWith(1, "user_1");
    expect(deleter).toHaveBeenNthCalledWith(2, "user_2");
    expect(listRegisteredTestIdentities()).toEqual([]);
  });

  it("falls back to the real deleteTestIdentity when no deleter is supplied", async () => {
    registerTestIdentity("user_default");

    const count = await drainTestIdentities();

    expect(count).toBe(1);
    expect(mockedDelete).toHaveBeenCalledWith("user_default");
  });

  it("continues past a failing deleter instead of stranding the rest", async () => {
    registerTestIdentity("bad");
    registerTestIdentity("good");
    const deleter = vi.fn().mockImplementation(async (clerkUserId: string) => {
      if (clerkUserId === "bad") throw new Error("boom");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const count = await drainTestIdentities({ deleter });

    expect(count).toBe(2);
    expect(deleter).toHaveBeenCalledTimes(2);
    expect(deleter).toHaveBeenNthCalledWith(1, "bad");
    expect(deleter).toHaveBeenNthCalledWith(2, "good");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(listRegisteredTestIdentities()).toEqual([]);

    warn.mockRestore();
  });
});
