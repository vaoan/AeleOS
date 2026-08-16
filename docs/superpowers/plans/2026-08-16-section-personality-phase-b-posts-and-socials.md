# Section Personality — Phase B: `posts` and `socials` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a fursona page two new section layouts — `socials`, a wall of brand-recognised link chips that covers every service on the internet and cannot break; and `posts`, which frames the social posts that genuinely embed — plus brand-named presets in the add-section control so the connectedness is discoverable.

**Architecture:** `socials` is pure string work in `features/actors/domain/social-links.ts`: a brand table maps a parsed hostname to a label, an icon and a handle extractor, and **any** `http(s)` address falls back to a generic chip showing its hostname. `posts` extends the existing provider table in `shared/domain/embed-providers.ts` with whichever of six services survives a real-browser check, and anything that fails becomes a `socials` chip instead. No new mechanism: `PLAYER_ORIGINS` and `frame-src` still derive from the table.

**Tech Stack:** TypeScript (strict), Vitest, fast-check, Playwright, Next 15 App Router, next-intl, Supabase (SQL only in `0009`), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-15-section-personality-design.md`

**Follows:** `docs/superpowers/plans/2026-08-15-section-personality-phase-a-provider-table.md` (merged as #150)

## Global Constraints

- **The provider table lives in `apps/hub/src/shared/domain/embed-providers.ts`** and `PLAYER_ORIGINS` is **derived** from it (`player-origins.ts` imports it **relatively** — `next.config.ts` transpiles `csp.ts` without path aliases, so an `@/` import builds under Vitest then fails the production build with `MODULE_NOT_FOUND`). Adding a provider adds its origin to `frame-src` automatically. **Never edit `PLAYER_ORIGINS` or `csp.ts` by hand.**
- **`EmbedProviderId` is derived** — `(typeof EMBED_PROVIDERS)[number]["id"]`. There is no union to edit; adding a table entry is the whole change.
- **Never match a host by prefix or suffix.** Compare the parsed `url.hostname` against an exact set.
- **Only `https:` reaches a frame**, checked before the host (a `javascript:` URL parses fine with an empty hostname). `safeHttpUrl` allows `http:` for plain links only, and that difference is deliberate.
- **Discard every query parameter.** Build each `src` from a fixed template.
- **A template performs no validation.** Every `resolve` returns a value already matched against a strict pattern, or `null`.
- **Never index a plain object with a user-controlled string.** Use `Map` or `Set`. A `Record` keyed by a path segment shipped a Critical in Phase A: `__proto__`/`constructor`/`toString` return truthy inherited values, bypass a `!entry` guard, and make the resolver **throw** on a public page render.
- **Verify a mechanism before writing a comment about it.** `new URL()` normalises dot-segments during parsing, so `../../` inputs are usually refused by a missing-segment guard long before any pattern is consulted. Phase A produced that wrong comment four times.
- **Never write a count into a comment** where it tracks an array's length. `check:docs` cannot catch it — the commenting symbol's own code never changes. Phase A removed one and reintroduced it twice.
- **`check:docs` is mechanical**: `then.code !== now.code && then.doc === now.doc`. Editing `EMBED_PROVIDERS` obliges one doc edit — its per-provider "URL forms accepted" line. Make it true and new; do not pad other TSDoc.
- **`apps/hub/tests/embeds.test.ts`'s `describe("PLAYER_ORIGINS")` block has two hand-written sample lists** in `[raw, options?]` tuple form; the second asserts **set equality**. Every provider added needs a sample in **both**, hand-written, and it must genuinely resolve.
- **Two property tests already guard the table** (`embed-providers-properties.test.ts`): no `resolve` throws for hostile input, and every `src` builds an origin equal to its provider's and present in `PLAYER_ORIGINS`. Both iterate the live table, so new providers are covered automatically. If either fails, it is a real defect — never adjust the test.
- **A layout that renders no field must not offer it.** `LINKED`, `ICONED`, `PICTURED` in `section-item-fields.tsx` decide what the editor shows.
- **Adding a layout is four edits and a guard catches a miss:** `SECTION_TYPES` (`domain/section-schema.ts`), `is_section_type()` (`supabase/migrations/0009_actor_profiles.sql`), a renderer in the `LAYOUTS` record (`presentation/public-sections.tsx`), and a name in **both** catalogues (`apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`, key `fursonas.types.*`). `section-limits-match-migration.test.ts` reads the SQL; `messages.test.ts` key-checks the catalogues.
- **`0009` is edited in place**, never superseded by a new migration file — every object is defined exactly once. Update the `actor_profiles.sections` column comment in the same change.
- **A person's own writing is not next-intl.** A missing `*_es` on somebody's item is an ordinary state, never an error.
- **Public links carry `rel="noopener noreferrer nofollow ugc"`** and no frame is granted `autoplay`.
- **Every export carries TSDoc stating the contract, not the types.** 100% coverage including branches.
- **Filenames kebab-case. Do not commit secrets. Never touch Libra's database.**
- Branch from an explicit base: `git checkout -b feat/posts-and-socials origin/main`, and verify with `git log --oneline origin/main..HEAD` before pushing.

**Commands** (repo root):

| purpose                                      | command                                            |
| -------------------------------------------- | -------------------------------------------------- |
| hub tests                                    | `pnpm --filter hub test`                           |
| one file                                     | `pnpm --filter hub test tests/embeds.test.ts`      |
| coverage                                     | `pnpm test:hub:coverage`                           |
| types                                        | `pnpm typecheck`                                   |
| lint                                         | `pnpm lint`                                        |
| docs                                         | `pnpm check:docs` (needs staged/committed changes) |
| **the gate CI runs and per-task gates miss** | `pnpm check:tools`                                 |

**`pnpm check:tools` is not optional.** It runs cspell, knip, jscpd, madge, stylelint, sherif and syncpack, and it runs inside the required `conformance` job. Phase A reached its final review with it red on 38 unknown words because no per-task gate ran it. **Every task in this plan runs it before committing**, and new brand names (`Bluesky`, `Mastodon`, `Pixelfed`, `Weasyl`, `Toyhouse`, `itch`, …) are exactly the words it will reject.

## File Structure

| file                                                                           | responsibility                                                          |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Create** `apps/hub/src/features/actors/domain/social-links.ts`               | The brand table and `resolveSocial`. Pure strings; no framework import. |
| **Create** `apps/hub/tests/social-links.test.ts`                               | Its unit tests.                                                         |
| **Modify** `apps/hub/src/features/actors/domain/section-schema.ts`             | `SECTION_TYPES` gains `socials`, then `posts`.                          |
| **Modify** `supabase/migrations/0009_actor_profiles.sql`                       | `is_section_type()` gains both; column comment updated.                 |
| **Modify** `apps/hub/src/features/actors/presentation/public-sections.tsx`     | Two renderers in `LAYOUTS`.                                             |
| **Modify** `apps/hub/src/features/actors/presentation/section-item-fields.tsx` | `LINKED`/`ICONED` gain the new layouts.                                 |
| **Modify** `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`     | Layout names, chip strings, preset names.                               |
| **Modify** `apps/hub/src/shared/domain/embed-providers.ts`                     | The surviving post providers.                                           |
| **Create** `apps/hub/src/features/actors/presentation/section-presets.ts`      | Brand-named presets for the add-section control.                        |
| **Modify** `apps/hub/src/features/actors/presentation/section-editor.tsx`      | Offer the presets.                                                      |

**Why `social-links.ts` sits in the feature and not in `shared/`:** `player-origins.ts` earned its place in `shared/` because _two unrelated things_ depend on it — the resolver builds on those origins and the CSP allows frames from them — and neither owns it. The brand table has exactly one consumer, the actors feature. Putting it in `shared/` would be cargo-culting the location without the reason.

---

### Task 1: The brand table

**Files:**

- Create: `apps/hub/src/features/actors/domain/social-links.ts`
- Create: `apps/hub/tests/social-links.test.ts`

**Interfaces:**

- Consumes: `safeHttpUrl` from `@/features/actors/domain/embeds`.
- Produces: `SocialBrand`, `ResolvedSocial`, `resolveSocial(raw: string | undefined): ResolvedSocial | null`.

**The design decision that makes this layout worth having:** unlike `resolveEmbed`, which refuses everything it does not recognise, **`resolveSocial` accepts any `http(s)` address.** A host it knows becomes a branded chip with the handle pulled out; a host it does not becomes a generic chip labelled with the hostname. That is what lets one layout cover FurAffinity, Toyhouse, Weasyl, Ko-fi, itch.io and whatever somebody links next, with no table entry and no risk. It returns `null` only for an address that is not linkable at all.

- [ ] **Step 1: Write the failing tests**

Create `apps/hub/tests/social-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveSocial } from "@/features/actors/domain/social-links";

describe("resolveSocial", () => {
  it("brands a known host and pulls out the handle", () => {
    expect(resolveSocial("https://www.instagram.com/luna.fox")).toMatchObject({
      label: "Instagram",
      handle: "@luna.fox",
    });
  });

  it("keeps the pasted address as the href", () => {
    expect(resolveSocial("https://furaffinity.net/user/luna")?.href).toBe(
      "https://furaffinity.net/user/luna",
    );
  });

  // The whole point of the layout: an unknown host is still a usable chip.
  it("falls back to the hostname for a host it does not know", () => {
    const chip = resolveSocial("https://some-artist-site.example/luna");
    expect(chip?.label).toBe("some-artist-site.example");
    expect(chip?.handle).toBeUndefined();
  });

  it("strips www. from a fallback label", () => {
    expect(resolveSocial("https://www.example.com/x")?.label).toBe(
      "example.com",
    );
  });

  it("brands a host by exact match, never by suffix", () => {
    expect(
      resolveSocial("https://instagram.com.evil.example/luna")?.label,
    ).toBe("instagram.com.evil.example");
  });

  it("accepts http, which a frame may not", () => {
    expect(resolveSocial("http://oldsite.example/luna")).not.toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "not a url", undefined])(
    "refuses %s",
    (raw) => {
      expect(resolveSocial(raw)).toBeNull();
    },
  );

  it("gives a profile with no handle segment no handle", () => {
    expect(resolveSocial("https://www.instagram.com/")?.handle).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test tests/social-links.test.ts`
Expected: FAIL — `Failed to resolve import "@/features/actors/domain/social-links"`.

- [ ] **Step 3: Implement**

Create `apps/hub/src/features/actors/domain/social-links.ts`.

```ts
import { safeHttpUrl } from "@/features/actors/domain/embeds";

/** A service this app can recognise by name. */
export interface SocialBrand {
  /** What to call it on the chip. */
  label: string;
  /**
   * A lucide icon name, or undefined for the generic one.
   *
   * **These are category glyphs, not brand marks, and that is forced.** The
   * installed lucide has no `Instagram`, `Twitter`, `Github`, `Twitch` or
   * `Youtube` — its brand set was removed — so a camera stands for a photo
   * service, a paw for a fandom one, a palette for an art one. Verified
   * against the installed package; a name lucide does not have renders as
   * nothing, which is a chip with a hole in it.
   *
   * **Never use lucide's `X` for X/Twitter.** It exists, and it is the
   * close/dismiss cross — putting it on somebody's profile link would render a
   * "delete" glyph beside their name.
   */
  icon?: string;
  /**
   * Which path segment holds the handle, counting from zero.
   *
   * `undefined` means the service has no handle worth showing. A number rather
   * than a function because every service here puts it in a fixed position,
   * and a callback per brand would be a place for one of them to throw.
   */
  handleAt?: number;
}

/** A chip the `socials` layout can render. */
export interface ResolvedSocial {
  /** The service's name, or the bare hostname when unrecognised. */
  label: string;
  /** A lucide icon name, when there is a fitting one. */
  icon?: string;
  /** The handle, `@`-prefixed, when the address carries one. */
  handle?: string;
  /** The address to link to — exactly what was pasted, once validated. */
  href: string;
}

/**
 * Hosts this app can name, keyed by the hostname with `www.` stripped.
 *
 * A `Map` and not an object literal: it is looked up with a hostname taken
 * from a pasted address, and a plain object would return inherited members for
 * `__proto__`, `constructor` and friends — which shipped a crash in Phase A.
 *
 * Adding a service is one entry. Getting it wrong costs nothing: an
 * unrecognised host still renders, labelled with its own hostname.
 */
const BRANDS = new Map<string, SocialBrand>([
  ["instagram.com", { label: "Instagram", icon: "camera", handleAt: 0 }],
  ["x.com", { label: "X", icon: "message-circle", handleAt: 0 }],
  ["twitter.com", { label: "X", icon: "message-circle", handleAt: 0 }],
  ["t.me", { label: "Telegram", icon: "send", handleAt: 0 }],
  ["pinterest.com", { label: "Pinterest", icon: "pin", handleAt: 0 }],
  // bsky.app/profile/<handle>/… — the handle is the SECOND segment.
  ["bsky.app", { label: "Bluesky", icon: "cloud", handleAt: 1 }],
  ["furaffinity.net", { label: "FurAffinity", icon: "paw-print", handleAt: 1 }],
  ["weasyl.com", { label: "Weasyl", icon: "paw-print", handleAt: 1 }],
  ["toyhou.se", { label: "Toyhouse", icon: "paw-print", handleAt: 0 }],
  ["ko-fi.com", { label: "Ko-fi", icon: "coffee", handleAt: 0 }],
  ["patreon.com", { label: "Patreon", icon: "heart", handleAt: 0 }],
  ["deviantart.com", { label: "DeviantArt", icon: "palette", handleAt: 0 }],
  ["artstation.com", { label: "ArtStation", icon: "palette", handleAt: 0 }],
  ["github.com", { label: "GitHub", icon: "code", handleAt: 0 }],
  ["twitch.tv", { label: "Twitch", icon: "tv", handleAt: 0 }],
  ["youtube.com", { label: "YouTube", icon: "video", handleAt: 0 }],
  ["soundcloud.com", { label: "SoundCloud", icon: "music", handleAt: 0 }],
  ["vimeo.com", { label: "Vimeo", icon: "clapperboard", handleAt: 0 }],
  ["mastodon.social", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  ["meow.social", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  ["furry.engineer", { label: "Mastodon", icon: "at-sign", handleAt: 0 }],
  // pawb.social LOOKS Mastodon-shaped but runs Lemmy, a link aggregator —
  // confirmed via its own /nodeinfo/2.1 while verifying Task 4's Mastodon
  // roster. Do not brand it Mastodon on the strength of the hostname alone.
  ["pawb.social", { label: "Lemmy", icon: "layers", handleAt: 0 }],
]);

/**
 * Turns a pasted address into a chip the socials layout can render.
 *
 * **Unlike {@link resolveEmbed}, this accepts anything linkable.** A host in
 * the table becomes a named chip with its handle; a host outside it becomes a
 * chip labelled with its own hostname. That is what lets one layout cover the
 * whole of somebody's presence — including services that publish no embed and
 * never will — with no entry required and nothing to break.
 *
 * `http:` is allowed where a frame would refuse it, for the reason
 * `safeHttpUrl` gives: a plain link is the person's own choice of destination
 * and parts of this fandom's web have never had a certificate.
 *
 * @param raw - the address somebody pasted, which may be anything at all.
 * @returns the chip, or null when the address must not be linked at all.
 */
export function resolveSocial(raw: string | undefined): ResolvedSocial | null {
  const href = safeHttpUrl(raw);
  if (!href) return null;
  const url = new URL(href);
  const host = url.hostname.replace(/^www\./, "");
  const brand = BRANDS.get(host);
  const segments = url.pathname.split("/").filter(Boolean);
  const segment =
    brand?.handleAt === undefined ? undefined : segments[brand.handleAt];
  return {
    label: brand?.label ?? host,
    icon: brand?.icon,
    // Some services already carry the `@` in the path; do not double it.
    handle: segment ? `@${segment.replace(/^@/, "")}` : undefined,
    href,
  };
}
```

**One limit of exact-host matching, which is a real gap and not a bug:** services that give each person a **subdomain** — `luna.itch.io`, `luna.bandcamp.com`, `luna.tumblr.com` — cannot be branded from an exact hostname table, because the hostname is different for every user. They fall through to the generic chip and are labelled `luna.itch.io`, which is informative and correct. **Do not "fix" this with suffix matching.** Suffix matching is exactly what the embed resolver refuses, for exactly the reason it refuses it: `evil-itch.io` and `itch.io.evil.example` both end or begin plausibly. A chip labelled with its own hostname is a good outcome; a chip that can be spoofed into wearing a brand's name is not.

- [ ] **Step 4: Re-verify the icon names, and confirm the naming format**

Every name in the table above was checked against the installed `lucide-react` while this plan was written — `camera`, `message-circle`, `send`, `pin`, `cloud`, `paw-print`, `coffee`, `heart`, `palette`, `code`, `tv`, `video`, `music`, `clapperboard`, `at-sign` all exist; `Instagram`, `Twitter`, `Github`, `Twitch`, `Youtube` do not. Re-run it anyway, because a dependency bump between then and now is exactly the kind of drift this repo keeps catching:

```bash
cd apps/hub && node -e "
const i = require('lucide-react');
const kebab = s => s.replace(/(?!^)([A-Z])/g, '-\$1').toLowerCase();
const want = ['camera','message-circle','send','pin','cloud','paw-print','coffee','heart','palette','code','tv','video','music','clapperboard','at-sign'];
const have = new Set(Object.keys(i).map(kebab));
for (const n of want) if (!have.has(n)) console.log('MISSING', n);
console.log('checked', want.length);
"
```

**The stored format is kebab-case**, matching `CARD_ICON = "circle-dot"` in `public-sections.tsx` — not the PascalCase export name. Confirm `PublicSectionIcon` resolves the names you store; a name in the wrong case renders nothing, silently.

Report what came back. Anything missing loses its `icon` and falls back to the generic chip rather than being replaced by a guess.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter hub test tests/social-links.test.ts`
Expected: PASS.

- [ ] **Step 6: Gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:tools`
`check:tools` will reject the new brand names — add them to `cspell.json` in the existing convention.

```bash
git add apps/hub/src/features/actors/domain/social-links.ts apps/hub/tests/social-links.test.ts cspell.json
git commit -m "feat(sections): a brand table for links out"
```

---

### Task 2: The `socials` layout

**Files:**

- Modify: `apps/hub/src/features/actors/domain/section-schema.ts`
- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Modify: `apps/hub/src/features/actors/presentation/section-item-fields.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/tests/public-sections.test.tsx`

**Interfaces:**

- Consumes: `resolveSocial`, `ResolvedSocial` from Task 1.
- Produces: `"socials"` in `SECTION_TYPES`.

- [ ] **Step 1: Write the failing tests**

In `apps/hub/tests/public-sections.test.tsx`, add a `socials` suite asserting: a known host renders its brand label and handle; an unknown host renders its hostname; an item whose `link_url` is unlinkable renders as plain text and **not** as an anchor; and every anchor carries `rel="noopener noreferrer nofollow ugc"` and `target="_blank"`.

```tsx
it("renders an unlinkable address as text, never as an anchor", () => {
  render(
    <PublicSections
      locale="en"
      parentHost=""
      sections={[
        {
          name_en: "Elsewhere",
          type: "socials",
          sort_order: 1,
          items: [
            {
              title_en: "Somewhere",
              description_en: "",
              link_url: "javascript:alert(1)",
              sort_order: 1,
            },
          ],
        },
      ]}
    />,
  );
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("Somewhere")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/public-sections.test.tsx`
Expected: FAIL — `socials` is not a `SectionType`, so this will not compile.

- [ ] **Step 3: Wire the layout through all four places**

1. `SECTION_TYPES` gains `"socials"`.
2. `is_section_type()` in `0009` gains `'socials'`, and the `actor_profiles.sections` column comment is updated in the same edit.
3. A `Socials` renderer in the `LAYOUTS` record.
4. `fursonas.types.socials` in **both** catalogues.

Add `"socials"` to `LINKED` and to `ICONED` in `section-item-fields.tsx` — the address is the whole point, and the icon is offered so somebody can override a derived one.

The renderer: a wrapping flex of chips, each an anchor when `resolveSocial` returns a chip and a plain `span` when it returns null. Show the item's own `title` as the chip's main text, falling back to the brand label; show the handle beneath. Item icon wins over the derived icon — an author who picked one meant it.

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test`
Expected: PASS, including `section-limits-match-migration.test.ts` (it reads the SQL) and `messages.test.ts` (it key-checks both catalogues). If either fails, one of the four edits is missing.

- [ ] **Step 5: Gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:docs && pnpm check:tools`

```bash
git add apps/hub/src supabase/migrations/0009_actor_profiles.sql apps/hub/tests
git commit -m "feat(sections): a socials layout that brands any link out"
```

---

### Task 3: Find out which post embeds actually work

**Files:** none. The output is a findings table reported to the controller, which decides Task 4's roster. Nothing is committed by this task.

**This is a verification task and its output is an answer, not code.** Phase A shipped seven wrong constants because they were written from plausibility rather than checked. The six candidates here are the least reliable in the whole spec, and three of them are documented as running on endpoints nobody promised us.

- [ ] **Step 1: Load each candidate in a real browser**

For each address below, open it directly, **logged out**, and record what renders: the post, a login wall, an error, or nothing.

| service   | candidate embed address                                        |
| --------- | -------------------------------------------------------------- |
| Telegram  | `https://t.me/{channel}/{id}?embed=1`                          |
| Bluesky   | `https://embed.bsky.app/embed/{did}/app.bsky.feed.post/{rkey}` |
| Instagram | `https://www.instagram.com/p/{shortcode}/embed`                |
| Twitter/X | `https://platform.twitter.com/embed/Tweet.html?id={id}`        |
| Pinterest | `https://assets.pinterest.com/ext/embed.html?id={id}`          |
| Mastodon  | `https://mastodon.social/@{user}/{id}/embed`                   |

Use real public posts you can find; record the exact URLs you tried.

- [ ] **Step 2: Answer the Bluesky question specifically**

The spec flags this as the open one. The shareable URL is
`bsky.app/profile/{handle}/post/{rkey}` but the documented embed is keyed by
**DID**. Determine whether `embed.bsky.app` accepts a handle in the DID
position. **If it does not, Bluesky is a `socials` chip and that is the correct
outcome** — resolving handle→DID is a fetch, and the spec refuses fetches. Do
not work around it.

- [ ] **Step 3: Check `X-Frame-Options` and `frame-ancestors`**

An address that renders when opened directly may still refuse to be framed. For each candidate that survived Step 1:

```bash
curl -sI "<candidate>" | grep -i "x-frame-options\|content-security-policy"
```

A `frame-ancestors` that excludes us, or `X-Frame-Options: DENY`, means the provider cannot be embedded whatever the resolver does. Record it.

- [ ] **Step 4: Write the findings**

Record, per service: works / login wall / refuses framing / no such endpoint; the exact URL tried; and the verdict — **`posts` provider** or **`socials` chip**.

**Report the table to the controller before Task 4 begins.** It decides Task 4's roster, and a service that fails here must not acquire a table entry: a provider the resolver knows with no working frame behind it is the "control that does nothing" fault in its purest form.

---

### Task 4: The `posts` layout, and whichever providers survived

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/src/features/actors/domain/section-schema.ts`
- Modify: `supabase/migrations/0009_actor_profiles.sql`
- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Modify: `apps/hub/src/features/actors/presentation/section-item-fields.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/tests/embeds.test.ts`, `apps/hub/tests/public-sections.test.tsx`

**Interfaces:**

- Consumes: Task 3's findings; `resolveSocial` for the fallback.
- Produces: `"posts"` in `SECTION_TYPES`; one table entry per surviving provider; a new `EmbedShape` member if the frames need one.

- [ ] **Step 1: Add the surviving providers to the table, one commit each**

For each service Task 3 marked **works**, add one entry: exact `hosts`, its `origin`, a `resolve` extracting an id against a strict pattern, and a `src` from a fixed template. Follow the existing entries' shape exactly.

**Mastodon takes a named list of instances, never a wildcard** — `mastodon.social`, `mstdn.social`, `meow.social`, `furry.engineer`. `frame-src` cannot enumerate hosts that do not exist yet, and opening it to `https:` would throw away the second layer under every media layout for one feature. Any other instance falls through to a `socials` chip — including `pawb.social`, which looks like a fifth Mastodon instance and is not: it runs Lemmy, a link aggregator, and its `/@user/{id}/embed` 404s. Confirmed via its own `/nodeinfo/2.1` (`"software":{"name":"lemmy"}`) while verifying this roster; a Mastodon-shaped hostname is not evidence of Mastodon software.

Each provider needs: its per-provider "URL forms accepted" line in `EMBED_PROVIDERS`' TSDoc; a sample in **both** `PLAYER_ORIGINS` lists; and accept/refuse cases including the lookalike-host forms.

- [ ] **Step 2: Add the `posts` layout**

The same four edits as Task 2 (`SECTION_TYPES`, `is_section_type()`, `LAYOUTS`, both catalogues), plus `"posts"` in `LINKED`.

**A post frame is neither `video` nor `audio` nor `portrait`.** If the surviving providers need a different aspect, add one member to `EmbedShape` and one entry to the `FRAME_SHAPE` record in `public-sections.tsx` — that record is `Record<EmbedShape, string>` precisely so a new shape cannot be added without a class.

- [ ] **Step 3: The fallback is a chip, not a hole**

An item in a `posts` section whose address resolves to no provider must render as a **`socials` chip**, not as nothing and not as a bare link. Reuse Task 1's `resolveSocial`. Test it: a Bluesky link in a `posts` section, when Bluesky is not a provider, must still render as a branded chip.

This is what makes the layout safe to offer for all six brands regardless of how many actually embed.

- [ ] **Step 4: Run everything**

Run: `pnpm --filter hub test`
Expected: PASS. Both property tests pick up the new entries automatically. If either fails, a resolver throws or builds an off-origin address — a real defect, not a test to adjust.

- [ ] **Step 5: Gate and commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm test:hub:coverage && pnpm check:docs && pnpm check:tools`

---

### Task 5: Brand-named presets in the add-section control

**Files:**

- Create: `apps/hub/src/features/actors/presentation/section-presets.ts`
- Modify: `apps/hub/src/features/actors/presentation/section-editor.tsx`
- Modify: `apps/hub/src/shared/infrastructure/i18n/messages/{en,es}.json`
- Modify: `apps/hub/tests/section-editor.test.tsx`

**This is the half of the spec that makes the connectedness discoverable**, and it was nearly argued away on engineering grounds. Section types name shapes, so there is no "Instagram" type — but on the sites this borrows from you added _an Instagram box_, and naming brands only in a field hint is too late, because a hint is found after the choice is made.

So the add-section control offers **brand-named presets**: choosing "Instagram" appends a `posts` section already named Instagram. Entries in an array in `presentation`, none in the schema, none in SQL.

- [ ] **Step 1: Write the failing test**

In `apps/hub/tests/section-editor.test.tsx`, assert that choosing a brand preset appends a section of the right `type` whose name is the brand. Use the existing test ids — the end-to-end suite runs in Spanish and may not assert on translated text, so a control without one cannot be reached.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/section-editor.test.tsx`

- [ ] **Step 3: Implement**

`SECTION_PRESETS` is a list of `{ id, type, nameKey }`. The **brand name is not translated** — Instagram is Instagram in both languages — but the group label ("Add a section for…") is. Follow the endonym reasoning already in the editor's language strip: a name that changes under somebody is how a picker becomes unreadable.

A preset appends; it does **not** replace. `TemplatePicker` replaces the whole array and asks first, and that distinction must not blur — somebody adding an Instagram box has not asked to lose their page.

- [ ] **Step 4: Run, gate, commit**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:tools`

---

### Task 6: The documentation the change obliges

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `docs/integrating.md` — **only if** it names the layouts or the embed roster
- Modify: `docs/superpowers/specs/2026-08-15-section-personality-design.md`

- [ ] **Step 1: Update the actors feature note**

The layouts table lists eleven; it gains `socials` and `posts` with what an item is and which fields each uses. Add the `socials` fallback rule — an unrecognised host is still a chip — because that is the property that makes the layout worth having and the one somebody would "fix" by refusing unknown hosts.

**Do not write a count.** The table itself is the list.

- [ ] **Step 2: Record what Task 3 found, in the spec**

The spec says of Twitter/X, Pinterest, Instagram, Bluesky and Mastodon that they are uncertain and must not be described as reliable. **Replace the uncertainty with the answer.** For each: works, or is a chip and why. A spec that still says "verify during Phase A" after Phase B has verified it is a stale pointer of the worst kind — it names a task that has already happened.

- [ ] **Step 3: Full gate and branch check**

```bash
pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm test:hub:coverage && pnpm check:docs && pnpm format:check && pnpm check:tools
git log --oneline origin/main..HEAD
```

Coverage must be 100%. The log must list only this plan's commits. **Do not push and do not open a pull request.**

---

## What Phase B deliberately does not do

- **No per-section form, no cards grid, no page background** — Phases C and D. Phase C's first task is the nested-skin fix the spike found, which is a prerequisite rather than a detail.
- **No fetch, and no pasted embed snippets.** Both refused in the spec with reasons; a service whose id is not in its URL is a `socials` chip.
- **No wildcard `frame-src`.** Federated services get a named instance list or a chip.
