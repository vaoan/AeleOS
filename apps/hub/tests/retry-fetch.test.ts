import { afterEach, describe, expect, it, vi } from "vitest";

import { ATTEMPTS, BACKOFF_MS, retryingFetch } from "./e2e/support/retry-fetch";

// **This module is test SUPPORT and is tested anyway**, because its failure
// mode is silent: a retry loop that never retries looks identical to one that
// works until the next time the network blips, which is exactly when nobody is
// watching. The unit that matters is "which failures are retried", and getting
// that backwards — retrying a 4xx — would turn a real refusal into a slow one.

/** A response that is not read for anything but its status. */
const reply = (status: number): Response =>
  new Response(status === 204 ? null : "{}", { status });

/** Waits instantly, so the backoff costs the suite nothing. */
const nowait = async (): Promise<void> => {};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("retryingFetch", () => {
  it("returns the first response when nothing goes wrong", async () => {
    const fetching = vi.fn().mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    const response = await retryingFetch("https://example.com", {}, nowait);

    expect(response.status).toBe(200);
    expect(fetching).toHaveBeenCalledTimes(1);
  });

  it("retries a connection failure and returns the response that arrives", async () => {
    const fetching = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    const response = await retryingFetch("https://example.com", {}, nowait);

    expect(response.status).toBe(200);
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  // **The case the whole design turns on.** An answer is an answer: retrying a
  // 429 or a 500 would make a real refusal slow rather than correct, and would
  // be the "retry until it passes" this repository forbids. Asserting the
  // status alone would not discriminate — a retried call that eventually
  // returned the same 429 looks identical — so the CALL COUNT is what pins it.
  it.each([400, 401, 429, 500, 503])(
    "does not retry a %i, because that is an answer",
    async (status) => {
      const fetching = vi.fn().mockResolvedValue(reply(status));
      vi.stubGlobal("fetch", fetching);

      const response = await retryingFetch("https://example.com", {}, nowait);

      expect(response.status).toBe(status);
      expect(fetching).toHaveBeenCalledTimes(1);
    },
  );

  it("gives up after every attempt fails, naming what went wrong", async () => {
    const fetching = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetching);

    await expect(
      retryingFetch("https://example.com/thing", {}, nowait),
    ).rejects.toThrow(/unreachable after 3 attempts.*fetch failed/s);
    expect(fetching).toHaveBeenCalledTimes(ATTEMPTS);
  });

  // The backoff is spent BETWEEN attempts and not after the last one, which is
  // an off-by-one worth pinning: waiting after the final failure delays a
  // failure nobody is waiting on, and there is one fewer wait than attempt.
  it("waits between attempts and not after the last", async () => {
    const fetching = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetching);
    const waits: number[] = [];

    await expect(
      retryingFetch("https://example.com", {}, async (ms) => {
        waits.push(ms);
      }),
    ).rejects.toThrow();

    expect(waits).toEqual(BACKOFF_MS);
    expect(waits).toHaveLength(ATTEMPTS - 1);
  });

  it("passes the request options through untouched", async () => {
    const fetching = vi.fn().mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    await retryingFetch(
      "https://example.com",
      { method: "POST", body: "{}" },
      nowait,
    );

    expect(fetching).toHaveBeenCalledWith("https://example.com", {
      method: "POST",
      body: "{}",
    });
  });
});
