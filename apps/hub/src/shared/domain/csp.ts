// Relative, not aliased, and this is load-bearing: `next.config.ts` imports
// this file and Next transpiles that config on its own, without the app's path
// aliases. An `@/` import here builds fine under vitest and then fails the
// production build with MODULE_NOT_FOUND — which is how this was found.
import { PLAYER_ORIGINS } from "./player-origins";

/** What {@link contentSecurityPolicy} needs to name the hosts it trusts. */
export interface CspHosts {
  /** Clerk's frontend API origin, or null when it could not be determined. */
  clerk: string | null;
  /** The Supabase project's origin, or null when it is not configured. */
  supabase: string | null;
}

/**
 * Clerk's frontend API origin, read out of a publishable key.
 *
 * The key encodes the host, so this needs no second environment variable that
 * could disagree with the one Clerk itself uses — a policy naming a different
 * Clerk host than the app talks to would block sign-in, and the two drifting
 * apart is exactly what a second variable invites.
 *
 * The payload is base64 with a trailing `$`. Anything that does not decode to
 * something shaped like a hostname returns null rather than throwing: this runs
 * while the config is being built, and a malformed key must surface as a missing
 * host somebody can report, not as a crash with no message.
 *
 * @param key - the `pk_test_…` or `pk_live_…` value.
 * @returns the origin, or null.
 */
export function clerkHostFromPublishableKey(
  key: string | undefined,
): string | null {
  const payload = (key ?? "").replace(/^pk_(test|live)_/, "");
  if (payload === key || !payload) return null;
  // No try/catch: `Buffer.from(…, "base64")` does not throw on input that is not
  // base64, it silently drops the characters it cannot read. So a malformed key
  // decodes to rubbish rather than raising, and the shape test below is what
  // actually rejects it. A catch here was unreachable code pretending to be a
  // safety net.
  const host = Buffer.from(payload, "base64")
    .toString("utf8")
    .replace(/\$$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}

/**
 * Cloudflare Turnstile, which Clerk frames for bot protection.
 *
 * **Leaving this out breaks sign-in and sign-up**, and it breaks them in the
 * way that is hardest to diagnose: the page renders, the form appears, and the
 * challenge is simply an empty box. It is the single most likely thing to be
 * forgotten when this policy is edited.
 */
const TURNSTILE = "https://challenges.cloudflare.com";

/** Where Clerk sends its own telemetry. */
const CLERK_TELEMETRY = "https://clerk-telemetry.com";

/**
 * The Content-Security-Policy header value.
 *
 * **Be clear about what this buys and what it does not.** `script-src` carries
 * `'unsafe-inline'`, because Next inlines its own bootstrap and hydration
 * payload and the alternative is a per-request nonce — which requires the proxy
 * to generate one and forces every page to render dynamically, giving up the
 * caching the public pages exist to benefit from. So **this policy is not a
 * defence against injected inline script**, and nothing here should be read as
 * though it were.
 *
 * **What stands in for `script-src` instead** is `html-sinks.test.ts`, which
 * counts every way a string can become markup or script in this app and fails
 * when a new one appears. There are two, both `<script>` fed a module constant
 * with no interpolation, and both asserted to stay that way. That is a narrower
 * guarantee than a nonce but it is checked on every pull request, and it costs
 * nothing — where a nonce would force every page to render dynamically, which
 * the public pages are exactly the wrong ones to give up.
 *
 * What it genuinely does, none of which depends on `script-src`:
 *
 *  * **`frame-src` is an allowlist built from {@link PLAYER_ORIGINS}**, so a
 *    frame can only ever point at a player this app can produce. That is the
 *    second layer under the media layouts: `resolveEmbed` already refuses to
 *    build any other address, and this refuses to load one even if it did.
 *    {@link PLAYER_ORIGINS} is itself derived from `EMBED_PROVIDERS` in
 *    `embed-providers.ts` rather than listed separately, so this policy
 *    cannot name a host the resolver refuses to build, or omit one it can —
 *    the agreement is structural, not two lists somebody has to keep in
 *    step.
 *  * **`object-src 'none'`** removes `<object>`, `<embed>` and `<applet>`,
 *    which are frames that predate every rule anybody wrote about frames.
 *  * **`base-uri 'self'`** stops an injected `<base>` from silently repointing
 *    every relative URL on the page, which is a redirect of the whole app.
 *  * **`form-action 'self'`** stops a form being made to post somewhere else.
 *  * **`frame-ancestors 'self'`** is clickjacking protection: no OTHER origin
 *    may put this app in a frame. It replaces `X-Frame-Options` and is
 *    stricter than that header's `SAMEORIGIN`.
 *
 *    **It was `'none'` until 2026-08-26, and the widening is exactly one
 *    origin: ours.** The complete-page preview frames `/{locale}/me/preview`
 *    to give a draft its own viewport, and `'none'` refused that outright —
 *    measured in a browser rather than reasoned about, which is the only
 *    reason it was found before shipping: the frame rendered blank and the
 *    violation appeared in the console, where nothing asserts.
 *
 *    What `'none'` bought over `'self'` was preventing our own pages from
 *    framing each other, which is now something this app deliberately does.
 *    Clickjacking is a CROSS-origin attack — an attacker's page framing ours
 *    to trick somebody into clicking — and `'self'` prevents every one of
 *    those. An attacker who can already serve a page on this origin has won
 *    without needing a frame.
 *
 * **`connect-src` allows any https host, and that is the ONE deliberate
 * widening.** A Winamp skin is a `.wsz` fetched from wherever its owner keeps
 * it, so no allowlist can be written in advance. What it costs, and why that is
 * less than it looks, is at the directive itself.
 *
 * **`img-src` allows any https host, and that is deliberate.** Every picture on
 * a fursona page is an address somebody pasted at a host that was never ours —
 * that is the platform's rule for external media — so an allowlist here would
 * be a list of the whole internet or a feature that does not work.
 *
 * A host that could not be resolved is **omitted rather than replaced with a
 * wildcard**. A policy missing the Clerk origin fails loudly at sign-in, which
 * is findable; a policy that quietly allowed everything would not fail at all.
 *
 * @param hosts - the origins this deployment talks to.
 * @returns the header value, as one line.
 */
export function contentSecurityPolicy(hosts: CspHosts): string {
  const clerk = hosts.clerk ? [hosts.clerk] : [];
  const supabase = hosts.supabase ? [hosts.supabase] : [];
  // Supabase Realtime is a websocket to the same host on a different scheme.
  const realtime = hosts.supabase
    ? [hosts.supabase.replace(/^https:/, "wss:")]
    : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'"],
    // See the note above: this is not the protective part of this policy.
    "script-src": ["'self'", "'unsafe-inline'", ...clerk],
    // Tailwind and Next both emit inline style attributes, and a nonce cannot
    // cover a style attribute at all.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Any https host: a picture is a pasted address, by design.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'"],
    // **`https:` rather than an allowlist, and this is the one deliberate
    // widening in the policy.** A `jukebox` wearing the Winamp chrome fetches a
    // `.wsz`, and the point of that feature is that somebody may point it at
    // ANY host — the Skin Museum's ~100,000, our own set, or a file they keep
    // themselves. No allowlist can be written in advance for the third.
    //
    // The cost is real and SMALLER than it first looks, said here so nobody
    // re-litigates it from the frightening version. This policy already carries
    // `script-src 'unsafe-inline'` — Next inlines its hydration payload — and
    // `img-src https:`, so an injected script can already exfiltrate one-way
    // through an image beacon. What this adds is the ability to READ a response
    // back, not the ability to leak.
    //
    // Rejected alternative: proxy arbitrary skins through a same-origin route.
    // It keeps this tight and buys an SSRF surface, egress filtering nobody
    // will maintain, and bandwidth on a free tier — three problems for one
    // directive.
    "connect-src": [
      "https:",
      "'self'",
      ...clerk,
      ...supabase,
      ...realtime,
      CLERK_TELEMETRY,
    ],
    "frame-src": ["'self'", TURNSTILE, ...clerk, ...PLAYER_ORIGINS],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "https:"],
    "manifest-src": ["'self'"],
  };

  const rendered = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
  // Not a directive with values, so it is appended rather than joined.
  return `${rendered}; upgrade-insecure-requests`;
}

/**
 * The policy for the running deployment, plus the headers that pair with it.
 *
 * `Referrer-Policy` and `X-Content-Type-Options` are here rather than in a
 * second place because they are the same kind of decision and reviewing them
 * together is the only way to notice one missing.
 *
 * @returns the headers, ready for Next's `headers()`.
 */
export function securityHeaders(): { key: string; value: string }[] {
  return [
    {
      key: "Content-Security-Policy",
      value: contentSecurityPolicy({
        clerk: clerkHostFromPublishableKey(
          process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
        ),
        supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
      }),
    },
    // Referrers leak the address of a private page to whatever it links to, and
    // a fursona page is full of links somebody else chose.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
  ];
}
