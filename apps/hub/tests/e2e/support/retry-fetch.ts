/**
 * How many times a request may be attempted before it is allowed to fail.
 *
 * Three: one more than a single blip needs, and far fewer than anything that
 * would hide a service being genuinely down.
 */
export const ATTEMPTS = 3;

/**
 * `error.cause.code` values that name a genuine CONNECTION-level failure —
 * the request never reached the service at all.
 *
 * Node's `fetch` (undici) wraps every such failure in a `TypeError` (message
 * "fetch failed") whose `cause` carries the real mechanism: an OS-level `net`
 * error
 * (`ECONNRESET`, `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, `EAI_AGAIN`,
 * `EPIPE`) or one of undici's own (`UND_ERR_SOCKET`,
 * `UND_ERR_CONNECT_TIMEOUT`, `UND_ERR_HEADERS_TIMEOUT`,
 * `UND_ERR_BODY_TIMEOUT`). Nothing outside this set is retried — see
 * {@link retryingFetch}.
 */
export const CONNECTION_ERROR_CODES = new Set([
  "ECONNRESET",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * When the most recent call to {@link retryingFetch} finished, successfully
 * or not.
 *
 * Module state on purpose: the signal this module exists to surface — a long
 * idle gap before a failure, the fingerprint of a stale pooled connection —
 * is a property of the gap BETWEEN calls, which no single call can see on its
 * own. `undefined` until the first call finishes, so the very first attempt
 * of a run reports no gap rather than a fabricated one.
 */
let previousCallEndedAt: number | undefined;

/**
 * The `code` and `name` off a thrown value's `cause`, when it has one.
 *
 * Reported rather than swallowed: this is the field the diagnosis used to
 * stop at "no response arrived" without ever looking past, and it is the only
 * thing that names the mechanism — DNS, a reset socket, a connect timeout —
 * behind a bare `TypeError: fetch failed`.
 *
 * @param error - whatever a failed `fetch` threw.
 * @returns the cause's `code` and `name`, or both `undefined` when there is
 * no `cause` or it carries neither.
 */
function causeOf(error: unknown): { code?: string; name?: string } {
  const cause = error instanceof Error ? error.cause : undefined;
  if (!cause || typeof cause !== "object") return {};
  const { code, name } = cause as { code?: unknown; name?: unknown };
  return {
    code: typeof code === "string" ? code : undefined,
    name: typeof name === "string" ? name : undefined,
  };
}

/**
 * Fetches, retrying a CONNECTION failure and nothing else.
 *
 * **This is an instrument first and a retry second.** Every prior version of
 * this module retried any throw at all, silently — which is a rule 33
 * violation in the shape this repository has already paid for once: the
 * retry swallowed the exact occurrence that would have named the mechanism,
 * the same way widening a timeout would have deleted the only signal that a
 * database query had degraded from 2.5ms to 1387ms. Nobody ever looked at
 * `error.cause`, so the diagnosis stopped at "no response arrived" and jumped
 * straight to "transient". Every caught throw is now reported — the attempt
 * number, the cause's `code` and `name`, and the milliseconds since the
 * previous call to this function finished — before any decision is made
 * about whether to retry it. A long idle gap before a failure is the
 * fingerprint of a stale pooled connection, which is a real, fixable
 * mechanism rather than weather; a short one points elsewhere. That report is
 * the primary reason this module exists. Retrying a genuinely transient
 * connection failure is the secondary benefit.
 *
 * **Only a CONNECTION-level cause is retried; everything else is rethrown
 * immediately, unretried.** A `fetch` that throws for a reason in
 * {@link CONNECTION_ERROR_CODES} never reached the service at all — DNS, a
 * reset socket, a refused or timed-out connection — so there is no answer to
 * respect and trying again is the only way to find out. A throw whose cause
 * is anything else (including no recognisable cause at all) is a different
 * bug, and retrying it would hide that bug rather than survive a blip — so it
 * is rethrown on the first attempt, unretried, exactly as fast as if this
 * wrapper were not here.
 *
 * **A retry happens at once, with no wait between attempts.** A backoff is a
 * guess about TIME, and it earns its place only when waiting changes the
 * outcome — a server that is overloaded, or rate-limiting, where a pause
 * gives it room to recover. This module's own diagnosis (below) established
 * that neither is true here: there was no 429, no status at all, the request
 * never reached the service. For a connection-level failure the socket is
 * already dead — a stale pooled connection, a reset — and waiting does not
 * revive a dead socket; a fresh attempt opens a new connection, and it can do
 * that immediately. The `BACKOFF_MS` this module used to carry was copied
 * from a rate-limit retry pattern and contradicted its own diagnosis: it
 * waited for a condition (load, a rate limit) that was never in evidence.
 *
 * **A response that arrives and says 4xx or 5xx is still never retried.** It
 * **is** an answer, and retrying it would turn a real refusal into a slow
 * real refusal. So a response is handed back whatever its status, and only a
 * throw is ever considered for a retry at all.
 *
 * **This is not a test retry and must not become one.** The browser suite
 * already sets `retries: 1`, which re-runs a whole case; this covers one
 * network call inside it. Rule 33 forbids retrying a flaky ASSERTION, whose
 * failure is evidence about our own code — here the assertion never runs at
 * all, because a throwaway identity could not be created.
 *
 * **Why it exists, measured rather than guessed (2026-08-29).** A run of the
 * browser suite makes about a hundred calls to `api.clerk.com` across fifteen
 * minutes, and one failing with `TypeError: fetch failed` aborted a case and
 * turned a required check red. It was NOT rate limiting, which was the first
 * guess and the wrong one: Clerk answers a rate limit with **429** and a body,
 * and the error carried `status: undefined` with `code: 'unexpected_error'` —
 * it never got a response at all. A hundred calls over fifteen minutes is
 * nowhere near a documented limit of roughly a hundred per ten seconds. What
 * the ORIGINAL cause code actually was went unrecorded, which is precisely
 * the gap this version closes.
 *
 * @param input - what to fetch.
 * @param init - fetch options.
 * @returns whatever response finally arrives, at any status.
 * @throws immediately, unretried, when a throw's cause is not one of
 * {@link CONNECTION_ERROR_CODES}. Otherwise throws once every attempt has
 * failed to reach the service at all.
 */
export async function retryingFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const callStartedAt = Date.now();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      try {
        return await fetch(input, init);
      } catch (error) {
        lastError = error;
        const { code, name } = causeOf(error);
        const sincePrevious =
          previousCallEndedAt === undefined
            ? "n/a (first call this run)"
            : `${callStartedAt - previousCallEndedAt}ms`;
        console.warn(
          `retryingFetch: attempt ${attempt + 1}/${ATTEMPTS} for ${input} ` +
            `failed — cause.code=${code ?? "unknown"} cause.name=${name ?? "unknown"} ` +
            `since previous call finished: ${sincePrevious}`,
        );

        if (code === undefined || !CONNECTION_ERROR_CODES.has(code)) {
          // Not a connection failure — a different bug, which retrying would
          // hide rather than survive. Rethrow immediately, unretried.
          throw error;
        }
        // A connection-level cause: retry at once. No wait — see the TSDoc
        // above on why a backoff has no place here.
      }
    }
    throw new Error(
      `${input} unreachable after ${ATTEMPTS} attempts: ${String(lastError)}`,
    );
  } finally {
    previousCallEndedAt = Date.now();
  }
}
