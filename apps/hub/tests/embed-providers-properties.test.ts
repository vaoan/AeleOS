import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";
import { PLAYER_ORIGINS } from "@/shared/domain/player-origins";

// THE CLAIM `embeds.ts` MAKES IS "a hostile value cannot become anything
// worse than no embed" — every `resolve` returns a string or null, never an
// exception. `embeds.test.ts` tests that per provider with hand-picked
// addresses, the way `palette.test.ts` tests fifteen hand-picked colours. It
// found nothing wrong, because a named test case only tries the inputs
// somebody thought of.
//
// `TIDAL_KINDS` broke the claim anyway: a plain object literal keyed
// directly by the untrusted `kind` segment resolves `__proto__` or
// `constructor` to an inherited, truthy value that passes the `!entry`
// guard and then has no `.id` to call `.test` on — a thrown `TypeError`
// reaching `resolveEmbed`, which has no try/catch around a provider's
// `resolve`. **100% branch coverage did not catch this**: every branch in
// `tidalPath` was exercised by `embeds.test.ts`'s named cases without ever
// choosing a key that walks the prototype chain, because none of those
// cases had a reason to.
//
// This is the property that would have caught it, generically, and that
// catches whichever provider reintroduces it next.

/** A path segment chosen to walk a prototype chain if the resolver lets it. */
const PROTOTYPE_SEGMENTS = [
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "hasOwnProperty",
  "valueOf",
];

/** A malformed or edge-case percent-escape. */
const PERCENT_SEGMENTS = ["%", "%z", "%zz", "%25", "%2e%2e", "%00"];

/** One path segment nobody pasting "just a video id" would type. */
const hostileSegment = fc.oneof(
  fc.constantFrom("", ...PROTOTYPE_SEGMENTS, ...PERCENT_SEGMENTS),
  fc.string({ maxLength: 300 }),
  fc.string({ minLength: 500, maxLength: 4000 }),
  fc.string({ maxLength: 100 }).map((value) => encodeURIComponent(value)),
);

/** A pathname built from zero to six hostile segments. */
const hostilePath = fc
  .array(hostileSegment, { maxLength: 6 })
  .map((segments) => `/${segments.join("/")}`);

describe("EMBED_PROVIDERS, over any hostile address", () => {
  it.each(EMBED_PROVIDERS.map((provider) => [provider.id, provider] as const))(
    "%s's resolve never throws, for any path or query",
    (_id, provider) => {
      // A generator that never produces a constructible URL would make every
      // run return early and this property would pass having called
      // `resolve` zero times. Counting the runs that actually reached it
      // turns that silent no-op into a failure.
      let attempted = 0;
      fc.assert(
        fc.property(hostilePath, fc.string(), (path, query) => {
          let url: URL;
          try {
            url = new URL(
              `https://${provider.hosts[0]}${path}?${encodeURIComponent(query)}`,
            );
          } catch {
            // Not every generated string is a constructible URL, and this
            // property is about `resolve`, not about `URL`'s own parser.
            return;
          }
          attempted++;
          const call = () => provider.resolve(url);
          expect(call).not.toThrow();
          const result = call();
          // A resolution or nothing — never a thrown TypeError, and never a
          // half-built object. `height` is asserted alongside `value` because
          // it reaches an inline style: a resolver that answered a string for
          // it would put an arbitrary declaration on somebody's page.
          if (result === null) return;
          expect(typeof result.value).toBe("string");
          expect(
            result.height === null || typeof result.height === "number",
          ).toBe(true);
        }),
        { numRuns: 300 },
      );
      expect(attempted).toBeGreaterThan(0);
    },
  );
});

// THE SECOND CLAIM `embeds.ts` makes is that the `src` a provider builds
// always lands on that provider's own origin — the thing `PLAYER_ORIGINS`
// (and, through it, the CSP's `frame-src`) is trusted to allow. `resolve
// never throws` says nothing about that: a template could stay on-origin for
// every hand-picked sample in `embeds.test.ts` and drift off it for an input
// nobody sampled. Each generator below approximates its provider's own valid
// shape — an id, not an arbitrary string — so `resolve` actually succeeds
// across many generated values per provider, not just the one somebody typed.
const digits = fc.stringMatching(/^\d{6,10}$/);
const segment = fc.stringMatching(/^[\w-]{1,20}$/);

/** A pathname (relative to the provider's own host) `resolve` should accept. */
const PLAUSIBLE_PATH: Record<string, fc.Arbitrary<string>> = {
  youtube: fc.stringMatching(/^[\w-]{11}$/).map((id) => `/${id}`),
  vimeo: digits.map((id) => `/${id}`),
  spotify: fc
    .tuple(
      fc.constantFrom("track", "album", "playlist", "artist"),
      fc.stringMatching(/^[A-Za-z0-9]{16,32}$/),
    )
    .map(([kind, id]) => `/${kind}/${id}`),
  soundcloud: fc.tuple(segment, segment).map(([a, b]) => `/${a}/${b}`),
  dailymotion: fc.stringMatching(/^[a-z0-9]{6,12}$/).map((id) => `/${id}`),
  tiktok: fc.stringMatching(/^\d{15,25}$/).map((id) => `/@user/video/${id}`),
  applemusic: digits.map((id) => `/us/song/slug/${id}`),
  deezer: digits.map((id) => `/track/${id}`),
  tidal: digits.map((id) => `/track/${id}`),
  mixcloud: fc.tuple(segment, segment).map(([a, b]) => `/${a}/${b}/`),
  twitch: fc.stringMatching(/^\w{3,25}$/).map((name) => `/${name}`),
  telegram: fc
    .tuple(fc.stringMatching(/^\w{5,32}$/), fc.stringMatching(/^\d{1,10}$/))
    .map(([channel, id]) => `/${channel}/${id}`),
  instagram: fc
    .tuple(
      fc.constantFrom("p", "reel", "tv"),
      fc.stringMatching(/^[\w-]{5,20}$/),
    )
    .map(([kind, code]) => `/${kind}/${code}`),
  twitter: fc
    .tuple(fc.stringMatching(/^\w{1,15}$/), fc.stringMatching(/^\d{1,25}$/))
    .map(([user, id]) => `/${user}/status/${id}`),
  pinterest: fc.stringMatching(/^\d{5,25}$/).map((id) => `/pin/${id}`),
  "mastodon-social": fc
    .tuple(fc.stringMatching(/^[\w.]{1,30}$/), fc.stringMatching(/^\d{1,25}$/))
    .map(([user, id]) => `/@${user}/${id}`),
  "mstdn-social": fc
    .tuple(fc.stringMatching(/^[\w.]{1,30}$/), fc.stringMatching(/^\d{1,25}$/))
    .map(([user, id]) => `/@${user}/${id}`),
  "meow-social": fc
    .tuple(fc.stringMatching(/^[\w.]{1,30}$/), fc.stringMatching(/^\d{1,25}$/))
    .map(([user, id]) => `/@${user}/${id}`),
  "furry-engineer": fc
    .tuple(fc.stringMatching(/^[\w.]{1,30}$/), fc.stringMatching(/^\d{1,25}$/))
    .map(([user, id]) => `/@${user}/${id}`),
};

/** The host each generated pathname above should be attached to. */
const PLAUSIBLE_HOST: Record<string, string> = {
  youtube: "youtu.be",
  vimeo: "vimeo.com",
  spotify: "open.spotify.com",
  soundcloud: "soundcloud.com",
  dailymotion: "dai.ly",
  tiktok: "tiktok.com",
  applemusic: "music.apple.com",
  deezer: "deezer.com",
  tidal: "tidal.com",
  mixcloud: "mixcloud.com",
  twitch: "twitch.tv",
  telegram: "t.me",
  instagram: "instagram.com",
  twitter: "x.com",
  pinterest: "pinterest.com",
  "mastodon-social": "mastodon.social",
  "mstdn-social": "mstdn.social",
  "meow-social": "meow.social",
  "furry-engineer": "furry.engineer",
};

describe("EMBED_PROVIDERS, wherever resolve succeeds", () => {
  it.each(EMBED_PROVIDERS.map((provider) => [provider.id, provider] as const))(
    "%s's src stays on its declared origin, in PLAYER_ORIGINS",
    (id, provider) => {
      const path = PLAUSIBLE_PATH[id];
      const host = PLAUSIBLE_HOST[id];
      // Same guard as the "never throws" property above: if a generator
      // drifted out of its provider's accepted shape, `value === null` would
      // return early on every run and this property would pass having
      // checked nothing. Counting the runs that actually resolved catches
      // that silently.
      let resolved = 0;
      fc.assert(
        fc.property(path, (pathname) => {
          const url = new URL(`https://${host}${pathname}`);
          const resolution = provider.resolve(url);
          if (resolution === null) return;
          resolved++;
          const origin = new URL(provider.src(resolution.value, "example.test"))
            .origin;
          expect(origin).toBe(provider.origin);
          expect(PLAYER_ORIGINS).toContain(origin);
        }),
        { numRuns: 200 },
      );
      expect(resolved).toBeGreaterThan(0);
    },
  );
});
