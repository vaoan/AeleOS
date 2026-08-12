import { describe, expect, it, vi } from "vitest";

const client = { marker: "hub-client" };
vi.mock("@/shared/infrastructure/supabase-server", () => ({
  createServerClient: vi.fn(async () => client),
}));

// Typed with a rest parameter so the forwarding below type-checks: a `vi.fn`
// inferred from a zero-argument implementation rejects being spread into.
const ensure = vi.fn<(...a: unknown[]) => Promise<string>>(
  async () => "act_abc",
);
const read = vi.fn<(...a: unknown[]) => Promise<null>>(async () => null);
vi.mock("@aeleos/identity", () => ({
  ensurePersonActor: (...a: unknown[]) => ensure(...a),
  getPersonActor: (...a: unknown[]) => read(...a),
}));

const actors = await import("@/features/actors/infrastructure/actors");

describe("the hub's actor adapters", () => {
  // The whole job of this layer is handing the package a client that carries
  // the hub's Clerk token. Passing the wrong one, or none, would authenticate
  // as nobody and RLS would return an empty result rather than an error.
  it("gives the package the hub's authenticated client", async () => {
    await actors.ensurePersonActor();
    expect(ensure).toHaveBeenCalledWith(client);
  });

  it("forwards the actor_ref alongside that client", async () => {
    await actors.getPersonActor("act_abc");
    expect(read).toHaveBeenCalledWith(client, "act_abc");
  });
});
