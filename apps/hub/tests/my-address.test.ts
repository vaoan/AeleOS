import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyAddress } from "@/features/actors/infrastructure/my-address";

/**
 * A client whose rpc answers with the given result.
 *
 * @param data - what the function returned.
 * @param error - the failure, when there is one.
 * @returns the client.
 */
const client = (data: unknown, error: unknown = null) =>
  ({
    rpc: vi.fn().mockResolvedValue({ data, error }),
  }) as unknown as SupabaseClient;

describe("readMyAddress", () => {
  it("returns the address", async () => {
    expect(await readMyAddress(client("luna-wolf"))).toBe("luna-wolf");
  });

  // A suspended person gets null, because the function resolves through
  // current_person_ref() and carries its active filter. Undefined here means
  // "there is nothing to show you", not "something went wrong".
  it("returns undefined when there is none", async () => {
    expect(await readMyAddress(client(null))).toBeUndefined();
  });

  // Not the same as having no address: /me must not quietly tell somebody they
  // have no profile because the database hiccupped.
  it("throws when the read fails", async () => {
    await expect(
      readMyAddress(client(null, { message: "connection reset" })),
    ).rejects.toThrow(/connection reset/);
  });
});
