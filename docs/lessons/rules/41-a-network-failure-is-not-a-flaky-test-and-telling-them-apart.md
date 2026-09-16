# Rule 41: A NETWORK failure is not a flaky test, and telling them apart decides whether retrying is discipline or its opposite.

41. **A NETWORK failure is not a flaky test, and telling them apart decides
    whether retrying is discipline or its opposite.** Rule 33 forbids retrying
    a flaky assertion, because the assertion's failure is evidence about our
    own code. A `fetch` to a third-party API that never gets a response is
    evidence about a socket, and the assertion it was setting up never ran at
    all — so the fix is to make the CALL resilient, which is ordinary
    engineering, and not to re-run the case, which would be hiding something.

    **The diagnosis has to come first, and the first diagnosis here was
    wrong.** A `TypeError: fetch failed` in the browser suite was read as
    Clerk rate limiting, and it was not: a rate limit is answered with **429**
    and a body, where this error carried `status: undefined` and
    `code: 'unexpected_error'` — it never got a response. The suite makes
    about a hundred backend calls across fifteen minutes against a documented
    limit of roughly a hundred per ten seconds, so the numbers were not close
    either. **An error with no HTTP status never reached the service**, and
    that single field is what separates "they refused us" from "we never got
    there".

    **Retry the throw, never the answer.** `retryingFetch`
    (`tests/e2e/support/retry-fetch.ts`) retries only when `fetch` itself
    throws; a 4xx or 5xx is handed straight back, because retrying a real
    refusal makes it a slow real refusal. Its test pins that by CALL COUNT
    rather than by status — a retried call that eventually returns the same
    429 looks identical from the status alone. Its coined vocabulary word,
    "unretried" — the throw that is rethrown on the first attempt rather
    than retried — is in `cspell.json`'s `words` list, next to "unweld" for
    the same reason. "ungated" joined the same list on 2026-08-30, for
    the same mechanical reason and no story of its own: a leaf's style
    popup review needed the word in a TSDoc and a test name, and
    `check:tools` does not know it.

    **The list is for a word the CODE needs, and prose does not qualify
    (2026-09-02).** A spec written on `editor-interaction-motion` coined a
    negated adjective for a leaf kind the picker does not offer, in one
    sentence of prose, and reddened `conformance`. All three entries above
    earned their place by naming something a reader meets in an identifier, a
    TSDoc or a test name, where the word is the thing's name and rewording it
    would rename the thing. A coined word used once in a sentence has no such
    claim: it was reworded, because an entry in `words` is permanent and
    lowers the checker's reach for everyone thereafter. Ask which of the two
    it is before reaching for the dictionary.

    **There is no backoff any more, and there never should have been
    (2026-08-29).** The first version of `retryingFetch` waited between
    attempts — `BACKOFF_MS = [250, 1000]` — copied from a rate-limit retry
    pattern without noticing it contradicted this rule's own diagnosis above.
    A backoff earns its place only when waiting changes the outcome: a
    server that is overloaded, or rate-limiting. Neither was ever true here —
    there was no 429, no status at all, the request never reached the
    service. For a connection-level failure the socket is already dead; a
    fresh attempt opens a new connection and can do that at once, so waiting
    buys nothing. It retries immediately now.

    **`no-restricted-syntax` bans the hand-rolled sleep under `tests/e2e/**`
    (and the retry module's own unit test), by owner's ruling.** A
    `Promise` wrapping a raw `setTimeout` is
    `playwright/no-wait-for-timeout`'s banned `page.waitForTimeout(ms)`
    spelled by hand to dodge the lint rule, and it is the same "wanting
    flaky tests instead of fixing things" the backoff above turned out to be.
    Two pre-existing sleeps are exempted by name, each with a targeted
    `eslint-disable-next-line` rather than a file exclusion, because neither
    is a guess about machine speed: `tests/e2e/support/drag.ts`'s
    rAF-then-timer sequencing (rule 26's ordering fix — MEASURED, not
    guessed: one macrotask lost the first arrow key every run, this
    construction lost it on none) and
    `tests/e2e/personalised-page-cost.spec.ts`'s wall-clock input pacing and
    its "unchanged since the last sample" poll, neither of which
    `expect.poll` can express. No third exemption should be added without the
    same kind of measurement behind it.
