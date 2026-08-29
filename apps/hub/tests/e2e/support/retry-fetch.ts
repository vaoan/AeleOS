/**
 * How many times a request may be attempted before it is allowed to fail.
 *
 * Three: one more than a single blip needs, and far fewer than anything that
 * would hide a service being genuinely down.
 */
export const ATTEMPTS = 3;

/** How long to wait before each retry, in milliseconds. */
export const BACKOFF_MS = [250, 1000];

/**
 * Fetches, retrying a CONNECTION failure and nothing else.
 *
 * **The distinction is the whole design.** A `fetch` that THROWS never reached
 * the service — DNS, a reset socket, a refused connection — so there is no
 * answer to respect and trying again is the only way to find out. A response
 * that arrives and says 4xx or 5xx **is** an answer, and retrying it would
 * turn a real refusal into a slow real refusal. So a response is handed back
 * whatever its status, and only a throw is retried.
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
 * nowhere near a documented limit of roughly a hundred per ten seconds.
 *
 * @param input - what to fetch.
 * @param init - fetch options.
 * @param sleep - how to wait between attempts; injected so a test does not.
 * @returns whatever response finally arrives, at any status.
 * @throws when every attempt fails to reach the service at all.
 */
export async function retryingFetch(
  input: string,
  init: RequestInit = {},
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      const wait = BACKOFF_MS[attempt];
      // No wait left means this was the final attempt.
      if (wait === undefined) break;
      await sleep(wait);
    }
  }
  throw new Error(
    `${input} unreachable after ${ATTEMPTS} attempts: ${String(lastError)}`,
  );
}
