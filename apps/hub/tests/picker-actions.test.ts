import { beforeEach, describe, expect, it, vi } from "vitest";

const listMyActors = vi.fn<(...a: unknown[]) => unknown>();
const redirect = vi.fn<(...a: unknown[]) => never>(() => {
  // Next's redirect signals by throwing. Modelling that here is what makes
  // "refused" distinguishable from "redirected": a refusal must not reach it.
  throw new Error("NEXT_REDIRECT");
});

// next/navigation's redirect, not the locale-aware wrapper: the destination is
// another app entirely, where a /es prefix would be meaningless. Mocking this
// module rather than the wrapper is itself the assertion that the action
// reaches for the right one.
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirect(...a),
}));
vi.mock("@/features/actors", () => ({
  listMyActors: (...a: unknown[]) => listMyActors(...a),
}));
// The real guard is left in place — mocking @/features/picker would leave the
// origin allowlist untested on the one path that can be reached from outside.
vi.mock("@/shared/infrastructure/env", () => ({
  env: { allowedReturnOrigins: ["https://puck.furrycolombia.com"] },
}));

const { chooseActorAction } =
  await import("@/app/[locale]/(app)/picker/actions");

/**
 * A submitted picker form, with overrides.
 *
 * @param over - fields to replace.
 * @returns the populated FormData.
 */
function form(over: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields = {
    return_to: "https://puck.furrycolombia.com/back",
    actor_ref: "ref-s",
    ...over,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/**
 * An actor row as `listMyActors` returns it, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Record<string, unknown>> = {}) {
  return {
    actorRef: "ref-s",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listMyActors.mockResolvedValue([actor()]);
});

describe("chooseActorAction", () => {
  it("hands the chosen actor back to the calling app", async () => {
    await expect(chooseActorAction(form())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirect).toHaveBeenCalledWith(
      "https://puck.furrycolombia.com/back?actor_ref=ref-s",
    );
  });

  // The whole reason the destination is assembled with URL and
  // searchParams.set. A literal `?actor_ref=` would fold the parameter into
  // the existing `a=b` value, and anything after a `#` never reaches the
  // server — so a return_to chosen by an attacker could suppress delivery of
  // the choice entirely while still looking like it worked.
  it("appends to an existing query and keeps the fragment last", async () => {
    await expect(
      chooseActorAction(
        form({ return_to: "https://puck.furrycolombia.com/back?a=b#frag" }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirect).toHaveBeenCalledWith(
      "https://puck.furrycolombia.com/back?a=b&actor_ref=ref-s#frag",
    );
  });

  it("replaces an actor_ref the caller planted in the return_to", async () => {
    await expect(
      chooseActorAction(
        form({
          return_to: "https://puck.furrycolombia.com/back?actor_ref=someone",
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirect).toHaveBeenCalledWith(
      "https://puck.furrycolombia.com/back?actor_ref=ref-s",
    );
  });

  // The hidden field is not a trusted channel: anything in the page can be
  // edited before it is submitted. Without this check the hub is an open
  // redirect operated through a form.
  it("refuses a tampered return_to without even reading the caller's actors", async () => {
    await expect(
      chooseActorAction(form({ return_to: "https://evil.example/steal" })),
    ).rejects.toThrow(/return_to/);
    expect(listMyActors).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a missing return_to", async () => {
    const fd = form();
    fd.delete("return_to");
    await expect(chooseActorAction(fd)).rejects.toThrow(/return_to/);
    expect(redirect).not.toHaveBeenCalled();
  });

  // A refusal that quotes what it refused makes this action a way to put an
  // attacker's sentence on a page under the hub's own name.
  it("never names the refused destination in the failure", async () => {
    await expect(
      chooseActorAction(
        form({ return_to: "https://evil.example/YOUR-ACCOUNT-IS-LOCKED" }),
      ),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("evil.example"),
      }),
    );
  });

  // listMyActors returns only the caller's own actors, so an actor belonging
  // to somebody else is simply not found. That is the authorization.
  it("refuses an actor_ref the caller does not own", async () => {
    await expect(
      chooseActorAction(form({ actor_ref: "someone-elses" })),
    ).rejects.toThrow(/not yours/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a suspended actor the caller does own", async () => {
    listMyActors.mockResolvedValueOnce([actor({ status: "suspended" })]);
    await expect(chooseActorAction(form())).rejects.toThrow(/not active/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("refuses a missing actor_ref rather than picking one", async () => {
    const fd = form();
    fd.delete("actor_ref");
    await expect(chooseActorAction(fd)).rejects.toThrow(/not yours/);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("lets a listMyActors failure propagate rather than reading as a refusal", async () => {
    listMyActors.mockRejectedValueOnce(new Error("Could not read your actors"));
    await expect(chooseActorAction(form())).rejects.toThrow(
      /Could not read your actors/,
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
