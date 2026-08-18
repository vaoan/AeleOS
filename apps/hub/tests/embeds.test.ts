import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  PLAYER_ORIGINS,
  backgroundImageValue,
  resolveEmbed,
  safeHttpUrl,
} from "@/features/actors/domain/embeds";
import { EMBED_PROVIDERS } from "@/shared/domain/embed-providers";

/**
 * The address this resolves to, or the empty string.
 *
 * Almost every assertion here is about a `src`, and the ones about a refusal
 * are about there being no embed at all — so a helper that flattens both to a
 * string keeps the refusals as short as the acceptances.
 *
 * @param raw - what somebody pasted.
 * @returns the frame address, or `""` when nothing was resolved.
 */
function src(raw: string | undefined): string {
  return resolveEmbed(raw)?.src ?? "";
}

describe("resolveEmbed", () => {
  describe("YouTube", () => {
    it.each([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
    ])("accepts %s", (raw) => {
      expect(src(raw)).toBe(
        "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      );
    });

    // The player is rebuilt on the no-cookie host whatever was pasted. It is
    // the same video and it sets no advertising cookie until somebody presses
    // play, which is the difference between a profile page that quietly tracks
    // every visitor and one that does not.
    it("rebuilds onto the no-cookie host", () => {
      expect(src("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toContain(
        "youtube-nocookie.com",
      );
    });

    // Everything else in the pasted address is discarded, not carried over. A
    // preserved query string is how `?autoplay=1` — or anything else a host
    // happens to honour — gets set by whoever pasted the link rather than by us.
    it("drops every other parameter", () => {
      expect(
        src("https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1&start=30"),
      ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    });

    it("refuses an id that is not eleven characters", () => {
      expect(src("https://www.youtube.com/watch?v=short")).toBe("");
    });

    it("refuses a watch link with no id at all", () => {
      expect(src("https://www.youtube.com/watch")).toBe("");
    });

    // Somebody pasting the front page, or a player path with nothing after it.
    // Both leave a path segment missing, which is the case the fallbacks in
    // this resolver exist for.
    it.each(["https://www.youtube.com/", "https://www.youtube.com/shorts"])(
      "refuses %s",
      (raw) => {
        expect(src(raw)).toBe("");
      },
    );
  });

  describe("Vimeo", () => {
    it.each([
      "https://vimeo.com/123456789",
      "https://www.vimeo.com/123456789",
      "https://player.vimeo.com/video/123456789",
    ])("accepts %s", (raw) => {
      expect(src(raw)).toBe("https://player.vimeo.com/video/123456789");
    });

    it("refuses a channel page", () => {
      expect(src("https://vimeo.com/channels/staffpicks")).toBe("");
    });

    it("refuses the front page", () => {
      expect(src("https://vimeo.com/")).toBe("");
    });
  });

  describe("Spotify", () => {
    it.each(["track", "album", "playlist", "artist", "episode", "show"])(
      "accepts a %s",
      (kind) => {
        expect(
          src(`https://open.spotify.com/${kind}/4cOdK2wGLETKBW3PvgPWqT`),
        ).toBe(`https://open.spotify.com/embed/${kind}/4cOdK2wGLETKBW3PvgPWqT`);
      },
    );

    // Spotify puts the country in the path for shared links.
    it("accepts a localised path", () => {
      expect(
        src("https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT"),
      ).toBe("https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT");
    });

    // The kind is part of the address being built, so it must come from the
    // allowlist and never from the string. Anything else is a path injection
    // into a URL we assemble ourselves.
    it("refuses a kind it does not know", () => {
      expect(src("https://open.spotify.com/user/somebody")).toBe("");
    });

    it("refuses an id with a slash in it", () => {
      expect(src("https://open.spotify.com/track/aaa/../../evil")).toBe("");
    });
  });

  describe("SoundCloud", () => {
    // The widget takes the track address as a parameter, so this is the one
    // provider where a URL goes inside a URL. It is REBUILT from the parsed
    // path and then encoded — never the pasted string, which would let a `&`
    // add parameters to the widget.
    it("accepts a track", () => {
      expect(src("https://soundcloud.com/artist/some-track")).toBe(
        "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsome-track",
      );
    });

    it("accepts a set", () => {
      expect(src("https://soundcloud.com/artist/sets/an-album")).toBe(
        "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Fsets%2Fan-album",
      );
    });

    it("refuses a bare profile", () => {
      expect(src("https://soundcloud.com/artist")).toBe("");
    });

    // The whole reason the address is rebuilt rather than passed through.
    it("cannot have parameters smuggled into the widget", () => {
      expect(
        src("https://soundcloud.com/artist/track?a=b&auto_play=true"),
      ).toBe(
        "https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack",
      );
    });
  });

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

  describe("TikTok", () => {
    it("accepts a video address", () => {
      expect(
        src("https://www.tiktok.com/@luna/video/7123456789012345678"),
      ).toBe("https://www.tiktok.com/embed/v2/7123456789012345678");
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
      // A `/video` segment with nothing after it — `kind` still reads
      // "video", so this is the case that exercises the id-is-absent branch
      // rather than the id-fails-the-pattern one above.
      "https://www.tiktok.com/@luna/video",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("Apple Music", () => {
    it("accepts an album", () => {
      expect(
        src("https://music.apple.com/us/album/some-record/1546861236"),
      ).toBe("https://embed.music.apple.com/us/album/1546861236");
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

  describe("Tidal", () => {
    it.each([
      ["https://tidal.com/browse/track/12345", "tracks/12345"],
      ["https://tidal.com/track/12345", "tracks/12345"],
      ["https://listen.tidal.com/album/98765", "albums/98765"],
    ])("accepts %s", (raw, path) => {
      expect(src(raw)).toBe(`https://embed.tidal.com/${path}`);
    });

    it("accepts a playlist, whose id is a UUID", () => {
      expect(
        src("https://tidal.com/playlist/1c5d01ed-4f05-40c4-bd28-0f73099e9648"),
      ).toBe(
        "https://embed.tidal.com/playlists/1c5d01ed-4f05-40c4-bd28-0f73099e9648",
      );
    });

    it.each([
      "https://tidal.com.evil.example/track/12345",
      "https://tidal.com/video/12345",
      "https://tidal.com/track/abc",
      // No path segment at all, so `kind` is undefined rather than merely
      // unrecognised — the branch the `kind ?? ""` fallback exists for.
      "https://tidal.com/",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

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
      // A `/videos` segment with nothing after it — `second` is undefined
      // rather than merely failing the digits pattern, which is the branch
      // the `second ?? ""` fallback exists for.
      "https://www.twitch.tv/videos",
      // **A single segment that reaches `TWITCH_NAME` and fails it.** Every
      // other refusal above leaves `twitchTarget` before that test — a wrong
      // host never gets there, `/videos/abc` returns from the broadcast
      // branch, and `/` and `/videos` return from the `!first || second`
      // guard. Without these two the only thing that ever made the channel
      // pattern FALSE was the hostile property test happening to generate
      // such a path, which is a coin flip rather than a case: the suite's
      // branch coverage went to 99.84% on the runs it did not come up. Two
      // segments below its floor and one carrying a character `\w` excludes.
      "https://www.twitch.tv/ab",
      "https://www.twitch.tv/lu-na",
    ])("refuses %s", (raw) => {
      expect(resolveEmbed(raw, opts)).toBeNull();
    });
  });

  describe("Telegram", () => {
    it("accepts a post address", () => {
      expect(src("https://t.me/telegram/436")).toBe(
        "https://t.me/telegram/436?embed=1",
      );
    });

    it("drops every parameter and forces the embed one back on", () => {
      expect(src("https://t.me/telegram/436?a=b")).toBe(
        "https://t.me/telegram/436?embed=1",
      );
    });

    it.each([
      "https://t.me.evil.example/telegram/436",
      "https://evil-t.me/telegram/436",
      "https://user@t.me@evil.example/telegram/436",
      "https://t.me/telegram",
      "https://t.me/abc/436",
      "https://t.me/telegram/abc",
      "https://t.me/",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("Instagram", () => {
    it.each([
      ["https://www.instagram.com/p/DbbY9pdm6Q2/", "p"],
      ["https://www.instagram.com/reel/DbbY9pdm6Q2/", "reel"],
      ["https://www.instagram.com/tv/DbbY9pdm6Q2/", "tv"],
    ])("accepts a %s address, always embedded as /p/", (raw) => {
      expect(src(raw)).toBe("https://www.instagram.com/p/DbbY9pdm6Q2/embed");
    });

    it.each([
      "https://instagram.com.evil.example/p/DbbY9pdm6Q2/",
      "https://evil-instagram.com/p/DbbY9pdm6Q2/",
      "https://user@instagram.com@evil.example/p/DbbY9pdm6Q2/",
      "https://www.instagram.com/story/DbbY9pdm6Q2/",
      // A recognised kind whose code still fails the pattern — two characters,
      // shorter than Instagram's own shortcode alphabet allows.
      "https://www.instagram.com/p/ab/",
      "https://www.instagram.com/p/",
      "https://www.instagram.com/",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("X/Twitter", () => {
    it.each([
      "https://x.com/NASA/status/2088355206723477740",
      "https://twitter.com/NASA/status/2088355206723477740",
    ])("accepts %s", (raw) => {
      expect(src(raw)).toBe(
        "https://platform.twitter.com/embed/Tweet.html?id=2088355206723477740",
      );
    });

    it.each([
      "https://x.com.evil.example/NASA/status/2088355206723477740",
      "https://evil-x.com/NASA/status/2088355206723477740",
      "https://user@x.com@evil.example/NASA/status/2088355206723477740",
      "https://x.com/NASA/likes/2088355206723477740",
      // The `status` segment is present and the id segment is present but not
      // all digits — the case the pattern check exists for, distinct from the
      // id being absent entirely.
      "https://x.com/NASA/status/abc",
      "https://x.com/NASA/status/",
      "https://x.com/NASA",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("Pinterest", () => {
    it("accepts a pin address", () => {
      expect(src("https://www.pinterest.com/pin/21744010694976967/")).toBe(
        "https://assets.pinterest.com/ext/embed.html?id=21744010694976967",
      );
    });

    it.each([
      "https://pinterest.com.evil.example/pin/21744010694976967/",
      "https://evil-pinterest.com/pin/21744010694976967/",
      "https://user@pinterest.com@evil.example/pin/21744010694976967/",
      "https://www.pinterest.com/board/21744010694976967/",
      "https://www.pinterest.com/pin/abc/",
      "https://www.pinterest.com/",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("Mastodon", () => {
    // One instance per entry, never a wildcard — see embed-providers.ts for
    // why, and for why pawb.social is not here at all: it answers this exact
    // path with a 404 because it runs Lemmy rather than Mastodon.
    it.each([
      [
        "https://mastodon.social/@Mastodon/116765910384325070",
        "https://mastodon.social/@Mastodon/116765910384325070/embed",
      ],
      [
        "https://mstdn.social/@Desa13l/117103829078125562",
        "https://mstdn.social/@Desa13l/117103829078125562/embed",
      ],
      [
        "https://meow.social/@avithetiger/113250402988268487",
        "https://meow.social/@avithetiger/113250402988268487/embed",
      ],
      [
        "https://furry.engineer/@sudaksis/117103833536639917",
        "https://furry.engineer/@sudaksis/117103833536639917/embed",
      ],
    ])("accepts %s", (raw, expected) => {
      expect(src(raw)).toBe(expected);
    });

    // pawb.social is not an allowlisted host at all — a Mastodon-shaped
    // address on it must resolve to nothing rather than to a guess.
    it.each([
      "https://mastodon.social.evil.example/@Mastodon/116765910384325070",
      "https://evil-mastodon.social/@Mastodon/116765910384325070",
      "https://user@mastodon.social@evil.example/@Mastodon/116765910384325070",
      "https://pawb.social/@somebody/1",
      "https://mastodon.social/Mastodon/116765910384325070",
      "https://mastodon.social/@Mastodon",
      "https://mastodon.social/",
      // **The two that reach the patterns and fail them**, which nothing
      // named did until now. Every refusal above returns from the
      // `!handle?.startsWith("@") || !id` guard one line earlier, so the only
      // thing that ever made `MASTODON_USER.test(user) &&
      // MASTODON_POST_ID.test(id)` false was the hostile property test
      // drawing such a path at random — the branch the whole suite's 100%
      // was intermittently missing, at 654/655. A handle carrying a
      // character `[\w.]` excludes, then an id that is not digits.
      "https://mastodon.social/@bad!user/116765910384325070",
      "https://mastodon.social/@Mastodon/11676591038432507o",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });
  });

  describe("what it refuses", () => {
    it("refuses nothing at all", () => {
      expect(src(undefined)).toBe("");
      expect(src("")).toBe("");
    });

    it("refuses a string that is not a URL", () => {
      expect(src("not a url")).toBe("");
    });

    // The single most important assertion in this file. A scheme that is not
    // https is how a frame becomes script execution in the page's own origin.
    it.each([
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "file:///etc/passwd",
    ])("refuses %s", (raw) => {
      expect(src(raw)).toBe("");
    });

    // Host matching is on the parsed host and exact. A prefix or suffix test
    // falls to both of these, which is the same mistake `return_to` had to
    // avoid in the picker.
    it.each([
      "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
      "https://evil.example/open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
      "https://open.spotify.com.evil.example/track/4cOdK2wGLETKBW3PvgPWqT",
    ])("refuses the lookalike host %s", (raw) => {
      expect(src(raw)).toBe("");
    });

    it("refuses a host nobody allowlisted", () => {
      expect(src("https://example.test/video/1")).toBe("");
    });

    // Userinfo in the authority is the classic way to make a hostile host read
    // as a friendly one. `URL` parses the real host, which is the reason this
    // works on the parsed value rather than the string.
    it("refuses a host hidden behind userinfo", () => {
      expect(
        src("https://www.youtube.com@evil.example/watch?v=dQw4w9WgXcQ"),
      ).toBe("");
    });
  });

  describe("what it reports", () => {
    it("names the provider so the frame can be titled and sized", () => {
      expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
        provider: "youtube",
        shape: "video",
      });
      expect(
        resolveEmbed("https://soundcloud.com/artist/some-track"),
      ).toMatchObject({ provider: "soundcloud", shape: "audio" });
    });
  });
});

describe("safeHttpUrl", () => {
  it.each(["https://example.test/refsheet", "http://example.test/an-old-site"])(
    "accepts %s",
    (raw) => {
      expect(safeHttpUrl(raw)).toContain("example.test");
    },
  );

  // React escapes text, not URL schemes. Nothing upstream of the anchor is
  // catching this, which is why the check is an allowlist of two rather than a
  // list of the schemes anybody happened to think of.
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("refuses %s", (raw) => {
    expect(safeHttpUrl(raw)).toBeNull();
  });

  it("refuses nothing at all", () => {
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

describe("PLAYER_ORIGINS", () => {
  // The content security policy's `frame-src` is built from this list, so the
  // resolver and the policy cannot drift. A provider added here without the
  // policy knowing resolves correctly and is then blocked by the browser — an
  // empty box with nothing in the network tab to explain it.
  it("covers every address the resolver can produce", () => {
    // Twitch alone needs `parentHost` — without it `resolveEmbed` returns
    // null, and the `!` below would throw rather than assert.
    const samples: [string, { parentHost?: string }?][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ"],
      ["https://vimeo.com/123456789"],
      ["https://player.vimeo.com/video/123456789"],
      ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"],
      ["https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT"],
      ["https://soundcloud.com/artist/some-track"],
      ["https://soundcloud.com/artist/sets/an-album"],
      ["https://dailymotion.com/video/x8abc12"],
      ["https://www.tiktok.com/@luna/video/7123456789012345678"],
      ["https://music.apple.com/us/album/some-record/1546861236"],
      ["https://www.deezer.com/album/12345"],
      ["https://tidal.com/track/12345"],
      ["https://www.mixcloud.com/luna/night-tape/"],
      ["https://www.twitch.tv/luna", { parentHost: "example.test" }],
      ["https://t.me/telegram/436"],
      ["https://www.instagram.com/p/DbbY9pdm6Q2/"],
      ["https://x.com/NASA/status/2088355206723477740"],
      ["https://www.pinterest.com/pin/21744010694976967/"],
      ["https://mastodon.social/@Mastodon/116765910384325070"],
      ["https://mstdn.social/@Desa13l/117103829078125562"],
      ["https://meow.social/@avithetiger/113250402988268487"],
      ["https://furry.engineer/@sudaksis/117103833536639917"],
    ];
    for (const [raw, options] of samples) {
      const resolved = resolveEmbed(raw, options);
      expect(resolved).not.toBeNull();
      expect([...PLAYER_ORIGINS]).toContain(new URL(resolved!.src).origin);
    }
  });

  // Every entry must be reachable, or the policy is allowing a frame origin
  // nothing can produce — which is a permission nobody is using and nobody
  // will remember to remove.
  it("has no origin the resolver cannot reach", () => {
    // Twitch alone needs `parentHost`, for the same reason as above.
    const reachable = new Set(
      (
        [
          ["https://youtu.be/dQw4w9WgXcQ"],
          ["https://vimeo.com/1"],
          ["https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"],
          ["https://soundcloud.com/artist/track"],
          ["https://dai.ly/x8abc12"],
          ["https://www.tiktok.com/@luna/video/7123456789012345678"],
          ["https://music.apple.com/us/album/some-record/1546861236"],
          ["https://www.deezer.com/album/12345"],
          ["https://tidal.com/track/12345"],
          ["https://www.mixcloud.com/luna/night-tape/"],
          ["https://www.twitch.tv/luna", { parentHost: "example.test" }],
          ["https://t.me/telegram/436"],
          ["https://www.instagram.com/p/DbbY9pdm6Q2/"],
          ["https://x.com/NASA/status/2088355206723477740"],
          ["https://www.pinterest.com/pin/21744010694976967/"],
          ["https://mastodon.social/@Mastodon/116765910384325070"],
          ["https://mstdn.social/@Desa13l/117103829078125562"],
          ["https://meow.social/@avithetiger/113250402988268487"],
          ["https://furry.engineer/@sudaksis/117103833536639917"],
        ] as [string, { parentHost?: string }?][]
      ).map(
        ([raw, options]) => new URL(resolveEmbed(raw, options)!.src).origin,
      ),
    );
    expect([...PLAYER_ORIGINS].sort()).toEqual([...reachable].sort());
  });
});

// THE PROPERTY IS ABOUT `resolveEmbed` ITSELF, where
// `embed-providers-properties.test.ts` is about each provider's own `resolve`.
// The difference is the layer, and it is the layer the fault actually reached:
// the prototype-pollution Critical arrived as a THROW out of this function,
// which puts no try/catch around a provider's `resolve` — and every block leaf
// on a page a stranger can open now calls it. A named case only ever tries the
// input somebody thought of; this tries the ones nobody did, against the whole
// function including its own trimming, scheme check and `www.`/`m.` stripping.

/** Every host the table claims, plus the near-misses an allowlist must refuse. */
const HOSTS = [
  ...EMBED_PROVIDERS.flatMap((provider) => [...provider.hosts]),
  "www.youtube.com",
  "m.youtube.com",
  "youtube.com.evil.example",
  "evil-youtube.com",
  "www.youtube.com@evil.example",
  "",
  "127.0.0.1",
];

/** Schemes, including the two an `href` or a frame must never carry. */
const SCHEMES = ["https", "http", "javascript", "data", "ftp", "HTTPS", "file"];

/** A path segment nobody pasting "just a video id" would type. */
const SEGMENTS = [
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "hasOwnProperty",
  "valueOf",
  "..",
  "%2e%2e",
  "%00",
  "%",
  // The words the resolvers themselves branch on, so a generated path reaches
  // past the first guard often enough to exercise what is behind it.
  "watch",
  "embed",
  "shorts",
  "video",
  "track",
  "sets",
  "browse",
  "status",
  "pin",
  "@user",
];

const segment = fc.oneof(
  fc.constantFrom(...SEGMENTS),
  fc.string({ maxLength: 60 }),
);

const address = fc.oneof(
  fc.string({ maxLength: 200 }),
  fc
    .tuple(
      fc.constantFrom(...SCHEMES),
      fc.constantFrom(...HOSTS),
      fc.array(segment, { maxLength: 5 }),
      fc.string({ maxLength: 40 }),
    )
    .map(
      ([scheme, host, parts, query]) =>
        `${scheme}://${host}/${parts.join("/")}?${query}`,
    ),
  // One arm that genuinely resolves, so the `framed` counter below can be
  // non-zero and the origin half of this property has something to check.
  fc.stringMatching(/^[\w-]{11}$/).map((id) => `  https://youtu.be/${id}  `),
);

describe("resolveEmbed, over any address at all", () => {
  it("never throws, and never builds a frame off an origin the policy forbids", () => {
    // Without this, a generator that stopped producing anything resolvable
    // would leave the origin assertion checking nothing and the property
    // passing forever — the silent no-op the sibling properties count runs
    // against for the same reason.
    let framed = 0;
    fc.assert(
      fc.property(
        address,
        fc.option(fc.string({ maxLength: 40 }), { nil: undefined }),
        (raw, parentHost) => {
          const call = () => resolveEmbed(raw, { parentHost });
          expect(call).not.toThrow();
          const resolved = call();
          if (!resolved) return;
          framed++;
          expect(PLAYER_ORIGINS).toContain(new URL(resolved.src).origin);
        },
      ),
      { numRuns: 1000 },
    );
    expect(framed).toBeGreaterThan(0);
  });

  // `safeHttpUrl` is the other half of what a leaf calls on untrusted text —
  // the `link` and `picture` kinds, and every embed fallback — so it carries
  // the same claim: an address it cannot make safe is refused, never escaped.
  it("keeps safeHttpUrl to http and https, whatever it is handed", () => {
    // The same anti-vacuity counter its sibling above carries, and for the
    // same reason: the assertion sits behind an early return on `null`, so a
    // generator change that stopped producing anything linkable would leave
    // this property passing forever while checking nothing. The shared
    // `address` arbitrary makes that unlikely today — relying on that is
    // exactly what the sibling's own comment argues against.
    let accepted = 0;
    fc.assert(
      fc.property(address, (raw) => {
        const call = () => safeHttpUrl(raw);
        expect(call).not.toThrow();
        const href = call();
        if (href === null) return;
        accepted++;
        expect(["http:", "https:"]).toContain(new URL(href).protocol);
      }),
      { numRuns: 1000 },
    );
    expect(accepted).toBeGreaterThan(0);
  });
});

describe("backgroundImageValue", () => {
  // **This is the sabotage-provable regression test, and a DOM-level one
  // cannot be.** jsdom's `CSSStyleDeclaration` silently drops a
  // malformed value on assignment — confirmed directly: setting
  // `element.style.backgroundImage` to the exact string this function would
  // build from a quoted host, were it not refused, reads back as `""`,
  // identically whether or not that refusal exists. A test that only
  // observes the rendered DOM therefore cannot go red on the unfixed code;
  // this one calls the pure function directly, before any sink gets a
  // chance to hide the difference.
  it("builds a url() value for a safe address", () => {
    expect(backgroundImageValue("https://example.test/bg.png")).toBe(
      'url("https://example.test/bg.png")',
    );
  });

  it("returns nothing for an address with no scheme http(s) can trust", () => {
    expect(backgroundImageValue("javascript:alert(1)")).toBeUndefined();
  });

  it("returns nothing when no address was given", () => {
    expect(backgroundImageValue(undefined)).toBeUndefined();
  });

  // The regression: `safeHttpUrl`'s WHATWG normalisation percent-encodes a
  // `"` in a path or query, but leaves one in the HOST untouched — confirmed
  // directly: `new URL('https://ex"ample.test/a.png').toString()` still
  // carries the quote. Built into `url("…")` unchecked, that quote would
  // close the CSS string early in ANY context that string is later
  // interpolated into, not only the one this file happens to use today.
  it("refuses an address whose host still carries a quote after normalisation", () => {
    expect(backgroundImageValue('https://ex"ample.test/a.png')).toBeUndefined();
  });

  // The second gap normalisation leaves open: a raw `\` in the query or
  // fragment survives `safeHttpUrl` untouched, and sitting right before the
  // closing `"` this function appends, it turns that closing quote into a
  // CSS escape sequence rather than the string's own end — the built value
  // never closes. `new URL('https://example.test/?x\\').toString()` keeps
  // the backslash verbatim, confirming this is not something normalisation
  // already handles.
  it("refuses an address whose query still carries a backslash", () => {
    expect(backgroundImageValue("https://example.test/?x\\")).toBeUndefined();
  });

  // A quote surviving in the path or query, by contrast, is exactly what
  // `safeHttpUrl` already neutralises — percent-encoded before this function
  // ever sees it — so it must still build a value rather than over-refusing.
  it("still builds a value when a quote only ever reached the path", () => {
    expect(backgroundImageValue('https://example.test/a".png')).toBe(
      'url("https://example.test/a%22.png")',
    );
  });
});
