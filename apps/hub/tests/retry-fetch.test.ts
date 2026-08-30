import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATTEMPTS,
  CONNECTION_ERROR_CODES,
  retryingFetch,
} from "./e2e/support/retry-fetch";

// **This module is test SUPPORT and is tested anyway**, because its failure
// mode is silent: a retry loop that never retries looks identical to one that
// works until the next time the network blips, which is exactly when nobody is
// watching. The unit that matters is "which failures are retried", and getting
// that backwards — retrying a 4xx, or retrying a throw that is not actually a
// connection failure — would turn a real refusal into a slow one, or hide a
// real bug behind a mechanism built for weather.

/** A response that is not read for anything but its status. */
const reply = (status: number): Response =>
  new Response(status === 204 ? null : "{}", { status });

/**
 * A `TypeError: fetch failed` carrying a real `cause`, the shape Node's
 * `fetch` (undici) actually throws — never the bare `TypeError` the fixtures
 * used before `error.cause` was inspected at all.
 *
 * @param code - the cause's `code`.
 * @param name - the cause's `name`.
 * @returns the wrapping `TypeError`.
 */
const fetchFailed = (code: string, name = "Error"): TypeError => {
  const cause = new Error(code);
  cause.name = name;
  (cause as Error & { code: string }).code = code;
  return new TypeError("fetch failed", { cause });
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("retryingFetch", () => {
  it("returns the first response when nothing goes wrong", async () => {
    const fetching = vi.fn().mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    const response = await retryingFetch("https://example.com");

    expect(response.status).toBe(200);
    expect(fetching).toHaveBeenCalledTimes(1);
  });

  it("retries a connection-level cause and returns the response that arrives", async () => {
    const fetching = vi
      .fn()
      .mockRejectedValueOnce(fetchFailed("ECONNRESET", "SocketError"))
      .mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    const response = await retryingFetch("https://example.com");

    expect(response.status).toBe(200);
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  // **Every code this module claims to retry, actually retried.** A set that
  // lists a code nothing ever exercises is a claim nobody has checked — see
  // `CONNECTION_ERROR_CODES`'s own list of what undici and Node's `net` throw.
  it.each([...CONNECTION_ERROR_CODES])("retries a %s cause", async (code) => {
    const fetching = vi
      .fn()
      .mockRejectedValueOnce(fetchFailed(code))
      .mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    const response = await retryingFetch("https://example.com");

    expect(response.status).toBe(200);
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  // **The direction this task was written to fix.** A throw whose cause is
  // NOT a connection failure is a different bug — retrying it would hide
  // that bug behind a mechanism built for weather. The call count is what
  // discriminates: a status or a message alone would not, since a rethrown
  // original error and a retried-then-thrown one can read alike.
  it("rethrows a non-connection cause immediately, without retrying", async () => {
    const originalError = fetchFailed(
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "TLSError",
    );
    const fetching = vi.fn().mockRejectedValue(originalError);
    vi.stubGlobal("fetch", fetching);

    await expect(retryingFetch("https://example.com")).rejects.toBe(
      originalError,
    );
    expect(fetching).toHaveBeenCalledTimes(1);
  });

  // A throw with no `cause` at all is the SAME direction as above — an
  // unrecognised mechanism — and must not be treated as "recognisable enough
  // to retry" merely because it is a `TypeError`.
  it("rethrows a throw with no cause immediately, without retrying", async () => {
    const originalError = new TypeError("fetch failed");
    const fetching = vi.fn().mockRejectedValue(originalError);
    vi.stubGlobal("fetch", fetching);

    await expect(retryingFetch("https://example.com")).rejects.toBe(
      originalError,
    );
    expect(fetching).toHaveBeenCalledTimes(1);
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

      const response = await retryingFetch("https://example.com");

      expect(response.status).toBe(status);
      expect(fetching).toHaveBeenCalledTimes(1);
    },
  );

  it("gives up after every attempt fails, naming what went wrong", async () => {
    const fetching = vi
      .fn()
      .mockRejectedValue(fetchFailed("ECONNRESET", "SocketError"));
    vi.stubGlobal("fetch", fetching);

    await expect(retryingFetch("https://example.com/thing")).rejects.toThrow(
      /unreachable after 3 attempts.*fetch failed/s,
    );
    expect(fetching).toHaveBeenCalledTimes(ATTEMPTS);
  });

  it("passes the request options through untouched", async () => {
    const fetching = vi.fn().mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    await retryingFetch("https://example.com", {
      method: "POST",
      body: "{}",
    });

    expect(fetching).toHaveBeenCalledWith("https://example.com", {
      method: "POST",
      body: "{}",
    });
  });

  // **The diagnostic this task exists for.** Nobody ever looked at
  // `error.cause` before this — the retry swallowed it silently — so the one
  // thing this suite must pin is that the cause's `code` and `name`, the
  // attempt number, and a gap since the previous call are actually reported,
  // not merely computed and discarded.
  it("reports the cause's code, name and attempt number on every failed attempt", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetching = vi
      .fn()
      .mockRejectedValueOnce(fetchFailed("ECONNRESET", "SocketError"))
      .mockResolvedValue(reply(200));
    vi.stubGlobal("fetch", fetching);

    await retryingFetch("https://example.com");

    expect(warned).toHaveBeenCalledTimes(1);
    const [message] = warned.mock.calls[0]!;
    expect(message).toContain("attempt 1/3");
    expect(message).toContain("cause.code=ECONNRESET");
    expect(message).toContain("cause.name=SocketError");
    // Either a number of milliseconds or the first-call sentinel — which one
    // depends on whether an earlier case in this file already completed a
    // call, so both are accepted rather than pinning one arbitrarily.
    expect(message).toMatch(/since previous call finished: (n\/a|\d+ms)/);
  });

  // A gap that genuinely elapsed between two calls is reported as a number,
  // not silently dropped — the fingerprint of a stale pooled connection this
  // module exists to surface.
  it("reports a real elapsed gap once a previous call has already finished", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200)));
    // Establishes `previousCallEndedAt` so the case below is measuring a real
    // gap rather than the first-call sentinel.
    await retryingFetch("https://example.com");

    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(fetchFailed("ECONNRESET", "SocketError"))
        .mockResolvedValue(reply(200)),
    );
    await retryingFetch("https://example.com");

    const [message] = warned.mock.calls[0]!;
    expect(message).toMatch(/since previous call finished: \d+ms/);
  });

  // Neither the code nor the name is asserted-as-present when there is none —
  // an unrecognised cause still gets a diagnostic, naming that it is unknown
  // rather than silently omitting the line.
  it("reports 'unknown' rather than nothing when a throw carries no cause", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    await expect(retryingFetch("https://example.com")).rejects.toThrow();

    const [message] = warned.mock.calls[0]!;
    expect(message).toContain("cause.code=unknown");
    expect(message).toContain("cause.name=unknown");
  });
});
