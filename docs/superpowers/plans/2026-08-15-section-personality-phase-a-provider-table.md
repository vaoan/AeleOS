# Section Personality — Phase A: the provider table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the seven-branch `resolveEmbed` with one provider table, derive `PLAYER_ORIGINS` from it so `frame-src` can never disagree with what the resolver builds, and add seven video and music providers.

**Architecture:** A pure data table in `shared/domain/embed-providers.ts` — one entry per provider declaring its hosts, origin, frame shape, a `resolve` that extracts an identifier, and a `src` that builds an address from a fixed template. `player-origins.ts` derives `PLAYER_ORIGINS` from that table instead of holding a literal. `features/actors/domain/embeds.ts` keeps `resolveEmbed` and `safeHttpUrl` as the feature's door onto it. No UI changes: `video` and `music` sections simply accept more addresses.

**Tech Stack:** TypeScript (strict), Vitest, Zod (env only), Next 15 App Router, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-15-section-personality-design.md`

## Global Constraints

- **The table lives in `shared/domain/`, not in the actors feature.** `csp.ts` imports `player-origins.ts` with a **relative** path because `next.config.ts` imports `csp.ts` and Next transpiles that config without the app's path aliases — an `@/` import there builds under Vitest and then fails the production build with `MODULE_NOT_FOUND`. `player-origins.ts` must therefore import the table relatively too, and `eslint-plugin-boundaries` forbids `shared/` importing a feature. Both rules point the same way.
- **Never match a host by prefix or suffix.** Compare the parsed `url.hostname` against an exact set. `youtube.com.evil.example`, `evil-youtube.com` and `https://www.youtube.com@evil.example` must all fail.
- **Only `https:` reaches a frame.** Checked before the host, because a `javascript:` URL parses fine and its `hostname` is empty.
- **Discard every query parameter on the pasted address.** The `src` is built from a template; nothing a person typed is carried over.
- **A `src` template performs no validation.** Every `resolve` must return a value already matched against a strict pattern, or `null`.
- **`resolveEmbed` returning `null` is an ordinary outcome**, not an error. The caller renders a plain link instead.
- **Every task that adds a provider must add a sample address to BOTH lists in `embeds.test.ts`'s `describe("PLAYER_ORIGINS")` block** (`tests/embeds.test.ts:248` and `:269`). The second asserts **set equality** between `PLAYER_ORIGINS` and the origins its samples reach, so a new table entry turns that test red until its sample exists — in a file the task otherwise has no reason to open. Those samples are deliberately hand-written rather than derived from the table: a test that generates its inputs from the thing under test is not independent evidence, so keep them literal and add one per provider. Twitch's sample must pass `{ parentHost: "example.test" }`, since `resolveEmbed` returns null for it otherwise and `resolveEmbed(raw)!.src` would throw.
- **No autoplay is ever granted** to any frame.
- **Every export carries TSDoc stating the contract, not the types.** `pnpm lint` fails without it. `pnpm check:docs` fails when an implementation moves and its TSDoc does not.
- **Every export tested on its happy path and on each failure mode.** Branch coverage gates the build; the hub runs at 100%.
- **Filenames are kebab-case.**
- **Do not commit secrets. Do not run anything against Libra's database.**
- Branch from an explicit base: `git checkout -b feat/embed-provider-table origin/main`. Verify with `git log --oneline origin/main..HEAD` before pushing — it must list only your commits.

**Commands** (from the repo root unless stated):

| purpose        | command                                       |
| -------------- | --------------------------------------------- |
| hub unit tests | `pnpm --filter hub test`                      |
| one test file  | `pnpm --filter hub test tests/embeds.test.ts` |
| coverage       | `pnpm test:hub:coverage`                      |
| types          | `pnpm typecheck`                              |
| lint           | `pnpm lint`                                   |
| doc freshness  | `pnpm check:docs`                             |

## File Structure

| file                                                                       | responsibility                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Create** `apps/hub/src/shared/domain/embed-providers.ts`                 | The table, its types, and `findProvider`. Pure data and pure functions; imports nothing.             |
| **Modify** `apps/hub/src/shared/domain/player-origins.ts`                  | Derives `PLAYER_ORIGINS` from the table. Relative import only.                                       |
| **Modify** `apps/hub/src/features/actors/domain/embeds.ts`                 | `resolveEmbed` becomes a table lookup. `safeHttpUrl` unchanged. Keeps re-exporting `PLAYER_ORIGINS`. |
| **Modify** `apps/hub/src/shared/infrastructure/env.ts`                     | Adds `hubHost`, needed only by Twitch's `parent`.                                                    |
| **Modify** `apps/hub/src/features/actors/presentation/public-sections.tsx` | Passes `parentHost` into `resolveEmbed`.                                                             |
| **Create** `apps/hub/tests/embed-providers.test.ts`                        | The table's own invariants.                                                                          |
| **Modify** `apps/hub/tests/embeds.test.ts`                                 | Existing suite stays green; new per-provider cases added.                                            |

`resolveEmbed`'s existing tests are the safety net for Task 1. **They must not be edited in Task 1** — a refactor whose tests change alongside it has proved nothing.

---

### Task 1: The table, with the four existing providers moved onto it

**Files:**

- Create: `apps/hub/src/shared/domain/embed-providers.ts`
- Create: `apps/hub/tests/embed-providers.test.ts`
- Modify: `apps/hub/src/shared/domain/player-origins.ts`
- Modify: `apps/hub/src/features/actors/domain/embeds.ts`

**Interfaces:**

- Produces: `EmbedProviderId`, `EmbedShape`, `EmbedProvider`, `EMBED_PROVIDERS`, `findProvider(hostname: string): EmbedProvider | null`, `providerOrigins(): string[]`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test for the derivation**

Create `apps/hub/tests/embed-providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  EMBED_PROVIDERS,
  findProvider,
  providerOrigins,
} from "@/shared/domain/embed-providers";

describe("EMBED_PROVIDERS", () => {
  it("gives every provider at least one host", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(provider.hosts.length).toBeGreaterThan(0);
    }
  });

  it("declares an https origin for every provider", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(provider.origin).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    }
  });

  it("claims no host twice", () => {
    const seen = EMBED_PROVIDERS.flatMap((provider) => [...provider.hosts]);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe("findProvider", () => {
  it("finds a provider by an exact host", () => {
    expect(findProvider("youtu.be")?.id).toBe("youtube");
  });

  // The whole security model in one assertion: a host is matched exactly,
  // never by prefix or suffix, so a lookalike domain resolves to nothing.
  it.each([
    "youtube.com.evil.example",
    "evil-youtube.com",
    "notspotify.com",
    "",
  ])("refuses %s", (host) => {
    expect(findProvider(host)).toBeNull();
  });
});

describe("providerOrigins", () => {
  it("returns each origin exactly once", () => {
    const origins = providerOrigins();
    expect(new Set(origins).size).toBe(origins.length);
  });

  it("covers every provider in the table", () => {
    for (const provider of EMBED_PROVIDERS) {
      expect(providerOrigins()).toContain(provider.origin);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test tests/embed-providers.test.ts`
Expected: FAIL — `Failed to resolve import "@/shared/domain/embed-providers"`.

- [ ] **Step 3: Create the table with the four providers that already exist**

Create `apps/hub/src/shared/domain/embed-providers.ts`. Move `YOUTUBE_ID`, `VIMEO_ID`, `SPOTIFY_ID`, `SOUNDCLOUD_SEGMENT`, `SPOTIFY_KINDS`, `youtubeCandidate`, `youtubeId`, `vimeoId`, `spotifyPath` and `soundcloudUrl` here from `embeds.ts` **unchanged** — this task must not alter a single acceptance or refusal.

```ts
/** A service whose player a fursona's page may frame. */
export type EmbedProviderId = "youtube" | "vimeo" | "spotify" | "soundcloud";

/**
 * How tall a player wants to be.
 *
 * The renderer cannot ask the frame, and a cross-origin frame cannot tell it,
 * so the shape travels with the resolution rather than being guessed from the
 * provider at the call site.
 */
export type EmbedShape = "video" | "audio";

/** Everything needed to turn one service's addresses into one player. */
export interface EmbedProvider {
  /** Whose player it is. */
  id: EmbedProviderId;
  /**
   * Exact hostnames, already stripped of a leading `www.` or `m.`.
   *
   * Matched by equality and never by prefix or suffix, which is what makes
   * `youtube.com.evil.example` and `evil-youtube.com` fail.
   */
  hosts: readonly string[];
  /** The origin its player is framed from. Feeds `frame-src`. */
  origin: string;
  /** How tall the frame should be. */
  shape: EmbedShape;
  /**
   * Extracts the identifier the template needs, or null.
   *
   * **The value it returns is interpolated without further checking**, so it
   * must already match a strict pattern. Returning null is ordinary — it means
   * this address is not one this provider can play.
   */
  resolve: (url: URL) => string | null;
  /** Builds the player address from a resolved identifier. */
  src: (value: string) => string;
}

// … the moved helpers (YOUTUBE_ID, youtubeCandidate, youtubeId, VIMEO_ID,
// vimeoId, SPOTIFY_ID, SPOTIFY_KINDS, spotifyPath, SOUNDCLOUD_SEGMENT,
// soundcloudUrl) go here, byte-identical to their originals in embeds.ts …

/**
 * Every service this platform can build a player address for.
 *
 * **One entry per provider, and the table is the only place a host or an
 * origin is named.** `PLAYER_ORIGINS` is derived from it, so the content
 * security policy cannot allow a frame the resolver refuses to build, or
 * refuse one it does.
 */
export const EMBED_PROVIDERS: readonly EmbedProvider[] = [
  {
    id: "youtube",
    hosts: ["youtube.com", "youtu.be"],
    origin: "https://www.youtube-nocookie.com",
    shape: "video",
    resolve: youtubeId,
    src: (id) => `https://www.youtube-nocookie.com/embed/${id}`,
  },
  {
    id: "vimeo",
    hosts: ["vimeo.com", "player.vimeo.com"],
    origin: "https://player.vimeo.com",
    shape: "video",
    resolve: vimeoId,
    src: (id) => `https://player.vimeo.com/video/${id}`,
  },
  {
    id: "spotify",
    hosts: ["open.spotify.com"],
    origin: "https://open.spotify.com",
    shape: "audio",
    resolve: spotifyPath,
    src: (path) => `https://open.spotify.com/embed/${path}`,
  },
  {
    id: "soundcloud",
    hosts: ["soundcloud.com"],
    origin: "https://w.soundcloud.com",
    shape: "audio",
    resolve: soundcloudUrl,
    src: (track) =>
      `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}`,
  },
];

/**
 * The provider claiming a hostname, or null.
 *
 * @param hostname - a parsed hostname, already stripped of `www.`/`m.`.
 * @returns the provider, or null when no entry claims it exactly.
 */
export function findProvider(hostname: string): EmbedProvider | null {
  if (!hostname) return null;
  return (
    EMBED_PROVIDERS.find((provider) => provider.hosts.includes(hostname)) ??
    null
  );
}

/**
 * Every origin the table can build a player on, each once.
 *
 * This is what `PLAYER_ORIGINS` is, and deriving it is the point: a host can no
 * longer be allowed in `frame-src` without a provider that builds on it, or
 * built without being allowed.
 *
 * @returns the origins, deduplicated.
 */
export function providerOrigins(): string[] {
  return [...new Set(EMBED_PROVIDERS.map((provider) => provider.origin))];
}
```

- [ ] **Step 4: Run the table's tests**

Run: `pnpm --filter hub test tests/embed-providers.test.ts`
Expected: PASS.

- [ ] **Step 5: Derive `PLAYER_ORIGINS`**

Modify `apps/hub/src/shared/domain/player-origins.ts`. Keep the existing TSDoc argument (two unrelated things depend on it and neither owns it) and add why it is now derived. **The import must stay relative.**

```ts
import { providerOrigins } from "./embed-providers";

/**
 * Every origin this platform is willing to put in a frame.
 *
 * … existing paragraphs about why this lives in `shared/` …
 *
 * **It is derived from `EMBED_PROVIDERS` rather than listed.** The two used to
 * be separate lists pinned to each other by tests on both sides; deriving makes
 * the agreement structural instead of asserted, so a provider added to the
 * table is allowed in `frame-src` in the same edit. A host left here after its
 * provider was removed is now impossible rather than merely tested for.
 *
 * The import is RELATIVE, and that is load-bearing: `next.config.ts` imports
 * `csp.ts`, which imports this file, and Next transpiles that config without
 * the app's path aliases. An `@/` import builds under Vitest and then fails the
 * production build with MODULE_NOT_FOUND.
 */
export const PLAYER_ORIGINS: readonly string[] = providerOrigins();
```

- [ ] **Step 6: Rewrite `resolveEmbed` as a lookup**

**A renamed export, and it is deliberate.** `embeds.ts` currently exports `EmbedProvider` as the union of four provider names. That name is now the _interface_ for a table entry, so the union becomes `EmbedProviderId`. Grep for the old name (`rg "EmbedProvider\b" apps/hub`) and update every importer; `pnpm check:docs` is per symbol and will flag the rename, which is correct — it is a changed contract, not a formality.

Modify `apps/hub/src/features/actors/domain/embeds.ts`. Delete the moved helpers and the seven `if` blocks. Keep `safeHttpUrl` and its TSDoc **untouched**. Keep the `PLAYER_ORIGINS` re-export. Keep `resolveEmbed`'s existing TSDoc — the security argument still describes exactly what happens — and add a sentence saying the branches are now a table.

```ts
export { PLAYER_ORIGINS } from "@/shared/domain/player-origins";
export type {
  EmbedProviderId,
  EmbedShape,
} from "@/shared/domain/embed-providers";

import { findProvider } from "@/shared/domain/embed-providers";
import type {
  EmbedProviderId,
  EmbedShape,
} from "@/shared/domain/embed-providers";

/** A player address this module built, and what it built it from. */
export interface ResolvedEmbed {
  /** Whose player it is. */
  provider: EmbedProviderId;
  /** The address to frame. Always `https:`, always on the provider's host. */
  src: string;
  /** How tall the frame should be. */
  shape: EmbedShape;
}

/** … keep the existing TSDoc in full, plus: …
 *
 * **The branches are a table now.** `EMBED_PROVIDERS` holds one entry per
 * service and this function is the lookup; the guarantees above are properties
 * of every entry rather than of a chain somebody has to read to the end.
 */
export function resolveEmbed(raw: string | undefined): ResolvedEmbed | null {
  const url = raw ? parse(raw.trim()) : null;
  // Checked before the host, because a `javascript:` URL parses fine and its
  // `hostname` is empty — the scheme is what makes it dangerous.
  if (!url || url.protocol !== "https:") return null;

  const provider = findProvider(url.hostname.replace(/^(www|m)\./, ""));
  if (!provider) return null;

  const value = provider.resolve(url);
  return value
    ? { provider: provider.id, src: provider.src(value), shape: provider.shape }
    : null;
}
```

- [ ] **Step 7: Run the whole existing suite — the refactor's real gate**

Run: `pnpm --filter hub test tests/embeds.test.ts tests/csp.test.ts tests/public-sections.test.tsx`
Expected: PASS, **with no edits to `embeds.test.ts`**. If any assertion needs changing, the refactor changed behaviour — find out which provider and put it back.

- [ ] **Step 8: Sabotage-verify the derivation**

Temporarily change the `vimeo` entry's `origin` to `"https://example.com"`.
Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: FAIL — the existing "every reachable origin is in PLAYER_ORIGINS" assertion (around `embeds.test.ts:278`) must go red. **Restore the entry.** A derivation never seen to fail proves nothing.

- [ ] **Step 9: Full gate**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm check:docs`
Expected: PASS. `check:docs` compares exported symbols against the base branch — moving nine helpers between files will flag them; move their TSDoc with them rather than suppressing.

- [ ] **Step 10: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts \
        apps/hub/src/shared/domain/player-origins.ts \
        apps/hub/src/features/actors/domain/embeds.ts \
        apps/hub/tests/embed-providers.test.ts
git commit -m "refactor(embeds): one provider table, with frame-src derived from it"
```

---

### Task 2: Dailymotion

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/tests/embeds.test.ts`

**Interfaces:**

- Consumes: `EmbedProvider`, `EMBED_PROVIDERS` from Task 1.
- Produces: `"dailymotion"` added to `EmbedProviderId`.

- [ ] **Step 1: Write the failing test**

Append to `apps/hub/tests/embeds.test.ts`, inside the top-level `describe("resolveEmbed")`:

```ts
describe("Dailymotion", () => {
  it.each([
    "https://www.dailymotion.com/video/x8abc12",
    "https://dailymotion.com/video/x8abc12",
    "https://dai.ly/x8abc12",
  ])("accepts %s", (raw) => {
    expect(src(raw)).toBe(
      "https://geo.dailymotion.com/player.html?video=x8abc12",
    );
  });

  it.each([
    "https://dailymotion.com.evil.example/video/x8abc12",
    "https://evil-dailymotion.com/video/x8abc12",
    "https://www.dailymotion.com/video/not_a_valid_id!",
    "https://www.dailymotion.com/",
    "http://www.dailymotion.com/video/x8abc12",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter hub test tests/embeds.test.ts -t Dailymotion`
Expected: FAIL — every acceptance returns `""`.

- [ ] **Step 3: Implement**

In `embed-providers.ts`, add `| "dailymotion"` to `EmbedProviderId`, then:

```ts
/** A Dailymotion video id: `x` and base36, which is what they issue. */
const DAILYMOTION_ID = /^[a-z0-9]{6,12}$/i;

/**
 * Resolves a Dailymotion address to one video id.
 *
 * `dailymotion.com/video/<id>` and the short `dai.ly/<id>` both carry the id as
 * the last segment, so one rule covers both.
 *
 * @param url - a parsed URL already known to be on a Dailymotion host.
 * @returns the video id, or null.
 */
function dailymotionId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = parts.at(-1) ?? "";
  return DAILYMOTION_ID.test(candidate) ? candidate : null;
}
```

And the entry:

```ts
  {
    id: "dailymotion",
    hosts: ["dailymotion.com", "dai.ly"],
    origin: "https://geo.dailymotion.com",
    shape: "video",
    resolve: dailymotionId,
    src: (id) => `https://geo.dailymotion.com/player.html?video=${id}`,
  },
```

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: PASS, including the origin-coverage assertion, which now covers Dailymotion automatically.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts apps/hub/tests/embeds.test.ts
git commit -m "feat(embeds): play Dailymotion videos"
```

---

### Task 3: TikTok, and a third frame shape

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx:320-327`
- Modify: `apps/hub/tests/embeds.test.ts`
- Modify: `apps/hub/tests/public-sections.test.tsx`

**Interfaces:**

- Produces: `"tiktok"` on `EmbedProviderId`; `"portrait"` on `EmbedShape`.

TikTok is vertical. `aspect-video` would letterbox it into a strip, so the shape grows rather than the renderer guessing from the provider — which is the rule `EmbedShape` already exists to keep.

- [ ] **Step 1: Write the failing tests**

In `tests/embeds.test.ts`:

```ts
describe("TikTok", () => {
  it("accepts a video address", () => {
    expect(src("https://www.tiktok.com/@luna/video/7123456789012345678")).toBe(
      "https://www.tiktok.com/embed/v2/7123456789012345678",
    );
  });

  it("asks for a portrait frame", () => {
    expect(
      resolveEmbed("https://www.tiktok.com/@luna/video/7123456789012345678")
        ?.shape,
    ).toBe("portrait");
  });

  it.each([
    "https://tiktok.com.evil.example/@luna/video/7123456789012345678",
    "https://www.tiktok.com/@luna",
    "https://www.tiktok.com/@luna/video/abc",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

In `tests/public-sections.test.tsx`, add to the existing player suite:

```tsx
it("frames a portrait player without the video aspect", () => {
  render(
    <PublicSections
      locale="en"
      sections={[
        {
          name_en: "Clips",
          type: "video",
          sort_order: 1,
          items: [
            {
              title_en: "A clip",
              description_en: "",
              link_url:
                "https://www.tiktok.com/@luna/video/7123456789012345678",
              sort_order: 1,
            },
          ],
        },
      ]}
    />,
  );
  const frame = screen.getByTitle("A clip");
  expect(frame.className).toContain("aspect-9/16");
  expect(frame.className).not.toContain("aspect-video");
});
```

- [ ] **Step 2: Run and watch both fail**

Run: `pnpm --filter hub test tests/embeds.test.ts tests/public-sections.test.tsx`
Expected: FAIL — no TikTok entry, and no `portrait` branch in `Player`.

- [ ] **Step 3: Implement the provider**

Add `| "tiktok"` to `EmbedProviderId` and `| "portrait"` to `EmbedShape`, updating that type's TSDoc to say a portrait frame is a phone-shaped one and which providers ask for it.

```ts
/** A TikTok video id: nineteen digits, and nothing else. */
const TIKTOK_ID = /^\d{15,25}$/;

/**
 * Resolves a TikTok address to one video id.
 *
 * The only shape with a player is `/@user/video/<id>`; a bare profile has no
 * embed and must resolve to null rather than to the profile page in a frame.
 *
 * @param url - a parsed URL already known to be on TikTok's host.
 * @returns the video id, or null.
 */
function tiktokId(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const [handle, kind, id] = parts;
  if (!handle?.startsWith("@") || kind !== "video") return null;
  return TIKTOK_ID.test(id ?? "") ? (id as string) : null;
}
```

```ts
  {
    id: "tiktok",
    hosts: ["tiktok.com"],
    origin: "https://www.tiktok.com",
    shape: "portrait",
    resolve: tiktokId,
    src: (id) => `https://www.tiktok.com/embed/v2/${id}`,
  },
```

- [ ] **Step 4: Teach `Player` the third shape**

In `public-sections.tsx`, replace the two-way ternary on `embed.shape` with a lookup, so a fourth shape cannot be added without a class:

```tsx
const FRAME_SHAPE: Record<EmbedShape, string> = {
  video: "aspect-video w-full rounded-xl surface border-(--edge)",
  portrait: "aspect-9/16 w-full max-w-80 rounded-xl surface border-(--edge)",
  audio: "h-42 w-full rounded-xl surface border-(--edge)",
};
```

and use `className={FRAME_SHAPE[embed.shape]}`. Import `EmbedShape` from `@/features/actors/domain/embeds`. Record the reason in `Player`'s TSDoc: a `Record<EmbedShape, …>` fails to compile when the union grows, where the ternary silently sent a new shape down the `audio` branch.

- [ ] **Step 5: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts tests/public-sections.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts \
        apps/hub/src/features/actors/presentation/public-sections.tsx \
        apps/hub/tests/embeds.test.ts apps/hub/tests/public-sections.test.tsx
git commit -m "feat(embeds): play TikTok, in a portrait frame"
```

---

### Task 4: Apple Music

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/tests/embeds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("Apple Music", () => {
  it("accepts an album", () => {
    expect(src("https://music.apple.com/us/album/some-record/1546861236")).toBe(
      "https://embed.music.apple.com/us/album/1546861236",
    );
  });

  it("accepts a playlist, whose id is not all digits", () => {
    expect(
      src("https://music.apple.com/gb/playlist/chill/pl.u-abc123XYZ"),
    ).toBe("https://embed.music.apple.com/gb/playlist/pl.u-abc123XYZ");
  });

  it.each([
    "https://music.apple.com.evil.example/us/album/x/1546861236",
    "https://music.apple.com/us/podcast/x/1546861236",
    "https://music.apple.com/USA/album/x/1546861236",
    "https://music.apple.com/us/album/x/../../evil",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

The slug is dropped, not carried: Apple's embed resolves from the country, kind and id alone, and a slug is a free-text segment somebody could put anything in.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/embeds.test.ts -t "Apple Music"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** A two-letter storefront, which is the only country form Apple issues. */
const APPLE_COUNTRY = /^[a-z]{2}$/;

/** An Apple Music id: digits, or a `pl.`-prefixed playlist token. */
const APPLE_ID = /^(\d+|pl\.[A-Za-z0-9_-]{4,64})$/;

/** The Apple Music resources with an embeddable player. */
const APPLE_KINDS = new Set(["album", "playlist", "song", "music-video"]);

/**
 * Resolves an Apple Music address to a storefront, a kind and an id.
 *
 * The human-readable slug between the kind and the id is DISCARDED rather than
 * carried over: the embed resolves from the other three, and a slug is a
 * free-text segment. Every part that survives is matched against a pattern
 * before it reaches the template.
 *
 * @param url - a parsed URL already known to be on Apple Music's host.
 * @returns the embed path, or null.
 */
function applePath(url: URL): string | null {
  const [country, kind, , id] = url.pathname.split("/").filter(Boolean);
  if (!country || !kind || !id) return null;
  if (!APPLE_COUNTRY.test(country)) return null;
  if (!APPLE_KINDS.has(kind) || !APPLE_ID.test(id)) return null;
  return `${country}/${kind}/${id}`;
}
```

```ts
  {
    id: "applemusic",
    hosts: ["music.apple.com"],
    origin: "https://embed.music.apple.com",
    shape: "audio",
    resolve: applePath,
    src: (path) => `https://embed.music.apple.com/${path}`,
  },
```

Add `| "applemusic"` to `EmbedProviderId`.

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts apps/hub/tests/embeds.test.ts
git commit -m "feat(embeds): play Apple Music albums, playlists and songs"
```

---

### Task 5: Deezer

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/tests/embeds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("Deezer", () => {
  it.each([
    ["https://www.deezer.com/album/12345", "album/12345"],
    ["https://www.deezer.com/en/track/98765", "track/98765"],
    ["https://deezer.com/es/playlist/555", "playlist/555"],
  ])("accepts %s", (raw, path) => {
    expect(src(raw)).toBe(`https://widget.deezer.com/widget/dark/${path}`);
  });

  it.each([
    "https://deezer.com.evil.example/album/12345",
    "https://www.deezer.com/podcast/12345",
    "https://www.deezer.com/album/abc",
    "https://www.deezer.com/",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/embeds.test.ts -t Deezer`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** The Deezer resources with an embeddable widget. */
const DEEZER_KINDS = new Set(["track", "album", "playlist", "artist"]);

/**
 * Resolves a Deezer address to a kind and a numeric id.
 *
 * A shared link may carry a two-letter language ahead of the kind, exactly as
 * Spotify's carries `intl-`. It is dropped: the widget takes neither.
 *
 * @param url - a parsed URL already known to be on Deezer's host.
 * @returns the widget path, or null.
 */
function deezerPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const rest = /^[a-z]{2}$/.test(parts[0] ?? "") ? parts.slice(1) : parts;
  const [kind, id] = rest;
  if (!kind || !id) return null;
  if (!DEEZER_KINDS.has(kind) || !/^\d+$/.test(id)) return null;
  return `${kind}/${id}`;
}
```

```ts
  {
    id: "deezer",
    hosts: ["deezer.com"],
    origin: "https://widget.deezer.com",
    shape: "audio",
    resolve: deezerPath,
    src: (path) => `https://widget.deezer.com/widget/dark/${path}`,
  },
```

Add `| "deezer"` to `EmbedProviderId`.

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts apps/hub/tests/embeds.test.ts
git commit -m "feat(embeds): play Deezer tracks, albums and playlists"
```

---

### Task 6: Tidal

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/tests/embeds.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe("Tidal", () => {
  it.each([
    ["https://tidal.com/browse/track/12345", "tracks/12345"],
    ["https://tidal.com/track/12345", "tracks/12345"],
    ["https://listen.tidal.com/album/98765", "albums/98765"],
  ])("accepts %s", (raw, path) => {
    expect(src(raw)).toBe(`https://embed.tidal.com/${path}`);
  });

  it.each([
    "https://tidal.com.evil.example/track/12345",
    "https://tidal.com/video/12345",
    "https://tidal.com/track/abc",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/embeds.test.ts -t Tidal`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** A Tidal playlist id, which is a UUID rather than a number. */
const TIDAL_UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/**
 * Tidal's embed path and id shape, by the kind its own address uses.
 *
 * A lookup rather than appending an `s`, because the plural is the EMBED's
 * spelling and not a transformation of the input — deriving it would break the
 * moment a kind pluralised irregularly, and would let an unknown kind through.
 *
 * **The id pattern is per kind and that is not tidiness.** Tracks and albums
 * are numeric while playlists are UUIDs, so one pattern wide enough for both
 * would accept `track/abc` — a value that is not an id at all, interpolated
 * into an address this app publishes.
 */
const TIDAL_KINDS: Record<string, { path: string; id: RegExp }> = {
  track: { path: "tracks", id: /^\d+$/ },
  album: { path: "albums", id: /^\d+$/ },
  playlist: { path: "playlists", id: TIDAL_UUID },
};

/**
 * Resolves a Tidal address to an embed path.
 *
 * `tidal.com/browse/track/<id>` and `tidal.com/track/<id>` are the same
 * resource, so a leading `browse` is dropped. Neither pattern admits a
 * separator, which is what stops `track/aaa/../../evil` walking out of the
 * path.
 *
 * @param url - a parsed URL already known to be on a Tidal host.
 * @returns the embed path, or null.
 */
function tidalPath(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const rest = parts[0] === "browse" ? parts.slice(1) : parts;
  const [kind, id] = rest;
  const entry = TIDAL_KINDS[kind ?? ""];
  if (!entry || !id || !entry.id.test(id)) return null;
  return `${entry.path}/${id}`;
}
```

```ts
  {
    id: "tidal",
    hosts: ["tidal.com", "listen.tidal.com"],
    origin: "https://embed.tidal.com",
    shape: "audio",
    resolve: tidalPath,
    src: (path) => `https://embed.tidal.com/${path}`,
  },
```

Add `| "tidal"` to `EmbedProviderId`. Add a playlist case to the test using a real UUID, so the second id pattern is covered rather than merely written:

```ts
it("accepts a playlist, whose id is a UUID", () => {
  expect(
    src("https://tidal.com/playlist/1c5d01ed-4f05-40c4-bd28-0f73099e9648"),
  ).toBe(
    "https://embed.tidal.com/playlists/1c5d01ed-4f05-40c4-bd28-0f73099e9648",
  );
});
```

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts apps/hub/tests/embeds.test.ts
git commit -m "feat(embeds): play Tidal tracks, albums and playlists"
```

---

### Task 7: Mixcloud

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/tests/embeds.test.ts`

Mixcloud is the second provider whose player takes an address as a parameter. SoundCloud's entry is the precedent: rebuild the inner path from parsed segments, then encode it, so a `&` in what somebody pasted cannot add parameters to the widget.

- [ ] **Step 1: Write the failing test**

```ts
describe("Mixcloud", () => {
  it("accepts a show", () => {
    expect(src("https://www.mixcloud.com/luna/night-tape/")).toBe(
      "https://player.mixcloud.com/widget/iframe/?feed=%2Fluna%2Fnight-tape%2F",
    );
  });

  // The inner address is a PARAMETER, so an ampersand in the path must not be
  // able to add one. This is SoundCloud's trap, in a second place.
  it("encodes a path that would otherwise add a parameter", () => {
    expect(src("https://www.mixcloud.com/luna/a&autoplay=1/")).toBe("");
  });

  it.each([
    "https://mixcloud.com.evil.example/luna/night-tape/",
    "https://www.mixcloud.com/luna/",
    "https://www.mixcloud.com/",
  ])("refuses %s", (raw) => {
    expect(src(raw)).toBe("");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm --filter hub test tests/embeds.test.ts -t Mixcloud`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** One path segment of a Mixcloud address. */
const MIXCLOUD_SEGMENT = /^[\w-]{1,64}$/;

/**
 * Rebuilds a canonical Mixcloud feed path.
 *
 * A show is `/<user>/<slug>/`, with the trailing slash the widget expects. A
 * bare profile has one segment and no player. Every segment is matched against
 * a pattern that admits no separator and no `&`, so the value the caller
 * encodes into the widget's `feed` parameter cannot introduce a second one.
 *
 * @param url - a parsed URL already known to be on Mixcloud's host.
 * @returns the feed path, or null.
 */
function mixcloudFeed(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2 || !parts.every((p) => MIXCLOUD_SEGMENT.test(p))) {
    return null;
  }
  return `/${parts.join("/")}/`;
}
```

```ts
  {
    id: "mixcloud",
    hosts: ["mixcloud.com"],
    origin: "https://player.mixcloud.com",
    shape: "audio",
    resolve: mixcloudFeed,
    src: (feed) =>
      `https://player.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(feed)}`,
  },
```

Add `| "mixcloud"` to `EmbedProviderId`.

- [ ] **Step 4: Run**

Run: `pnpm --filter hub test tests/embeds.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/hub/src/shared/domain/embed-providers.ts apps/hub/tests/embeds.test.ts
git commit -m "feat(embeds): play Mixcloud shows"
```

---

### Task 8: Twitch, and the `parent` its player demands

**Files:**

- Modify: `apps/hub/src/shared/domain/embed-providers.ts`
- Modify: `apps/hub/src/shared/infrastructure/env.ts`
- Modify: `apps/hub/src/features/actors/domain/embeds.ts`
- Modify: `apps/hub/src/features/actors/presentation/public-sections.tsx`
- Modify: `apps/hub/tests/embeds.test.ts`, `apps/hub/tests/env.test.ts`
- Modify: `.env.example` and `.secrets.example` if either lists public variables

**Interfaces:**

- Produces: `resolveEmbed(raw: string | undefined, options?: { parentHost?: string }): ResolvedEmbed | null`; `EmbedProvider.src` becomes `(value: string, parentHost: string) => string`; `Env.hubHost: string`.

Twitch refuses to play unless `parent=` names the domain doing the embedding. That is configuration, never anything an author typed. **When it is unset, Twitch resolves to null and the item renders as a plain link** — the same degradation every unresolvable address already gets, and the correct behaviour on a preview deployment where the parent cannot be right.

- [ ] **Step 1: Write the failing tests**

In `tests/embeds.test.ts`:

```ts
describe("Twitch", () => {
  const opts = { parentHost: "me.furrycolombia.com" };

  it("accepts a past broadcast", () => {
    expect(
      resolveEmbed("https://www.twitch.tv/videos/123456789", opts)?.src,
    ).toBe(
      "https://player.twitch.tv/?video=123456789&parent=me.furrycolombia.com",
    );
  });

  it("accepts a channel", () => {
    expect(resolveEmbed("https://www.twitch.tv/luna", opts)?.src).toBe(
      "https://player.twitch.tv/?channel=luna&parent=me.furrycolombia.com",
    );
  });

  // Without a configured parent the player cannot work, so it must degrade to
  // the link fallback rather than frame a box that will never load.
  it("resolves to nothing when no parent host is configured", () => {
    expect(resolveEmbed("https://www.twitch.tv/luna")).toBeNull();
  });

  it.each([
    "https://twitch.tv.evil.example/luna",
    "https://www.twitch.tv/videos/abc",
    "https://www.twitch.tv/",
  ])("refuses %s", (raw) => {
    expect(resolveEmbed(raw, opts)).toBeNull();
  });
});
```

In `tests/env.test.ts`, mirroring the existing `allowedReturnOrigins` cases:

```ts
it("defaults the hub host to empty rather than throwing", () => {
  // Same reasoning as the return-origin allowlist: an unset variable is a
  // deployment that does not embed Twitch, not a broken one.
  expect(readEnv({ ...base, NEXT_PUBLIC_HUB_HOST: undefined }).hubHost).toBe(
    "",
  );
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm --filter hub test tests/embeds.test.ts tests/env.test.ts`
Expected: FAIL — `resolveEmbed` takes one argument, and `hubHost` does not exist.

- [ ] **Step 3: Add the environment variable**

In `env.ts`, add to the zod schema, following the `AELEOS_ALLOWED_RETURN_ORIGINS` precedent exactly — defaulted, not required, with the reason in a comment:

```ts
  // Defaulted for the same reason the return-origin allowlist is: `z.string()`
  // alone rejects `undefined`, and this is read on public pages that every
  // visitor loads. An unset value is a deployment that cannot embed Twitch —
  // which degrades to a link — not one that should 500.
  NEXT_PUBLIC_HUB_HOST: z.string().default(""),
```

and to `Env`:

```ts
/**
 * This deployment's own hostname, with no scheme.
 *
 * Twitch's player refuses to load unless `parent=` names the embedding
 * domain, so this is the one provider that needs to know where it is. Empty
 * when unset, which makes Twitch resolve to nothing and render as a link —
 * the correct outcome on a preview deployment, where no fixed value could be
 * right.
 */
hubHost: string;
```

- [ ] **Step 4: Widen `src` and thread the option through**

In `embed-providers.ts`, change `EmbedProvider.src` to `(value: string, parentHost: string) => string` and update its TSDoc: every provider receives the host, only Twitch reads it, and passing it to all of them is what keeps the table one shape.

```ts
/** A Twitch channel name, or a past-broadcast id. */
const TWITCH_NAME = /^[A-Za-z0-9_]{3,25}$/;

/**
 * Resolves a Twitch address to a channel or a past broadcast.
 *
 * Returns the value already tagged with its kind — `video:123` or
 * `channel:luna` — because the two take different parameters and the template
 * must not have to re-parse what this already decided.
 *
 * @param url - a parsed URL already known to be on Twitch's host.
 * @returns the tagged value, or null.
 */
function twitchTarget(url: URL): string | null {
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (first === "videos") {
    return /^\d+$/.test(second ?? "") ? `video:${second}` : null;
  }
  if (!first || second) return null;
  return TWITCH_NAME.test(first) ? `channel:${first}` : null;
}
```

```ts
  {
    id: "twitch",
    hosts: ["twitch.tv"],
    origin: "https://player.twitch.tv",
    shape: "video",
    resolve: twitchTarget,
    src: (value, parentHost) => {
      const [kind, id] = value.split(":");
      return `https://player.twitch.tv/?${kind === "video" ? "video" : "channel"}=${id}&parent=${parentHost}`;
    },
  },
```

In `embeds.ts`, give `resolveEmbed` the option and refuse Twitch without it:

```ts
/** What {@link resolveEmbed} needs beyond the address. */
export interface ResolveEmbedOptions {
  /**
   * This deployment's hostname, for the one provider that demands it.
   *
   * Twitch's player refuses to load unless `parent=` names the embedding
   * domain. Absent means Twitch resolves to null and the caller renders a
   * link — never a frame that would load an error.
   */
  parentHost?: string;
}
```

and, after the provider is found:

```ts
// Twitch is the only provider that cannot be built without knowing where it
// will be embedded. Refusing here rather than building a broken address is
// what routes it to the link fallback.
if (provider.id === "twitch" && !options?.parentHost) return null;
```

passing `options?.parentHost ?? ""` into `provider.src`.

- [ ] **Step 5: Pass it from the page**

In `public-sections.tsx`, read the host once at the top of `PublicSections` and thread it to `Player` through the two layouts that render one. `Video` and `Music` both take it and pass it on; no other layout does.

```tsx
// In PublicSections, before the map:
const parentHost = env.hubHost;

// Player gains the prop and hands it to the resolver:
function Player({
  url,
  title,
  fallback,
  parentHost,
}: {
  url: string | undefined;
  title: string;
  fallback: string;
  parentHost: string;
}) {
  const embed = resolveEmbed(url, { parentHost });
  // … unchanged from here: the link fallback, then the frame …
}
```

`Video` and `Music` currently receive `{ items, locale }`, and `LAYOUTS` is typed `Record<SectionType, (props: { items; locale }) => ReactNode>`. Widen that props type to carry `parentHost` so every layout is handed it and the two that need it use it — **widen the shared type rather than special-casing two entries**, because a `Record` whose entries have different signatures stops being the compile-time guard that makes a missing renderer impossible.

Record in `PublicSections`'s TSDoc that this is the only configuration the public renderer reads, that it exists for one provider, and that an empty value degrades Twitch to a link rather than breaking the page.

- [ ] **Step 6: Run**

Run: `pnpm --filter hub test`
Expected: PASS.

- [ ] **Step 7: Verify against the real player** — the spec calls this out as a verification, not an assumption

Run `pnpm --filter hub dev`, put `https://www.twitch.tv/<a live channel>` in a `video` section with `NEXT_PUBLIC_HUB_HOST=localhost` in `.env.local`, and confirm the player actually loads rather than showing Twitch's parent error. If it does not, Twitch becomes a link chip and this task's entry is deleted — that is an acceptable outcome and the spec says so.

- [ ] **Step 8: Commit**

```bash
git add apps/hub/src apps/hub/tests .env.example
git commit -m "feat(embeds): play Twitch channels and past broadcasts"
```

---

### Task 9: The documentation the change obliges

**Files:**

- Modify: `apps/hub/src/features/actors/CLAUDE.md`
- Modify: `apps/hub/src/features/actors/domain/embeds.ts` (TSDoc)
- Modify: `apps/hub/src/shared/domain/csp.ts` (TSDoc)
- Modify: `docs/integrating.md` only if it names the embed roster

A change to an implementation moves its documentation. `pnpm check:docs` catches the TSDoc; nothing catches the prose, so it is a task.

- [ ] **Step 1: Update the actors feature note**

In `apps/hub/src/features/actors/CLAUDE.md`, the section **"Embedded media is allowlist-and-rebuild, never pass-through"** says `domain/embeds.ts` is the whole security model. Add that the table now lives in `shared/domain/embed-providers.ts`, that `PLAYER_ORIGINS` is derived from it rather than pinned to it by tests on both sides, and that adding a provider is one entry. Keep every existing bullet — none of them stopped being true.

- [ ] **Step 2: Update `csp.ts`'s TSDoc**

It says `frame-src` "is an allowlist built from `PLAYER_ORIGINS`". Add that `PLAYER_ORIGINS` is itself derived from the provider table, so the policy cannot name a host the resolver refuses to build.

- [ ] **Step 3: Run the freshness gate**

Run: `pnpm check:docs`
Expected: PASS.

- [ ] **Step 4: Full gate before the pull request**

Run: `pnpm typecheck && pnpm lint && pnpm --filter hub test && pnpm test:hub:coverage && pnpm check:docs && pnpm format:check`
Expected: PASS, coverage at 100%.

- [ ] **Step 5: Confirm the branch base**

```bash
git log --oneline origin/main..HEAD
```

Expected: only this plan's commits. If it lists commits you did not write, rebuild with `git checkout -B feat/embed-provider-table origin/main` and cherry-pick.

- [ ] **Step 6: Commit and open the pull request**

```bash
git add apps/hub/src/features/actors/CLAUDE.md apps/hub/src/shared/domain/csp.ts
git commit -m "docs(embeds): the table is where a provider is added now"
git push -u origin feat/embed-provider-table
```

Four checks are required and admins are not exempt: `conformance`, `hub`, `idp-cloud`, `e2e`.

---

## What Phase A deliberately does not do

- **No `posts` or `socials` layout**, and therefore no Twitter/X, Instagram, Telegram, Pinterest, Bluesky or Mastodon. Those providers would be resolvable with no section that renders them — a control that does nothing, which is the fault this feature keeps producing. They land in Phase B with the layout that gives them somewhere to live, and Bluesky's handle→DID verification goes with them.
- **No per-section styling, no editor changes, no card grid.** Phases C and D.
- **No Bandcamp.** Its id is not in its URL, and the spec refuses both the fetch and the pasted snippet that would recover it.
