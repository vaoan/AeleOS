import { describe, expect, it } from "vitest";
import {
  PLAYER_ORIGINS,
  resolveEmbed,
  safeHttpUrl,
} from "@/features/actors/domain/embeds";

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
    ])("refuses %s", (raw) => {
      expect(resolveEmbed(raw, opts)).toBeNull();
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
        ] as [string, { parentHost?: string }?][]
      ).map(
        ([raw, options]) => new URL(resolveEmbed(raw, options)!.src).origin,
      ),
    );
    expect([...PLAYER_ORIGINS].sort()).toEqual([...reachable].sort());
  });
});
