import { describe, expect, it } from "vitest";
import { resolveEmbed, safeHttpUrl } from "@/features/actors/domain/embeds";

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
