import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedEmbed } from "@/features/actors/domain/embeds";
import { EmbedFrame } from "@/features/actors/presentation/embed-frame";
import { resolveEmbed } from "@/features/actors/domain/embeds";

/**
 * The resolution for one pasted address.
 *
 * Built by the real `resolveEmbed` rather than typed out, so a test cannot
 * describe a frame the app would never render — the origin a message is
 * checked against is the one the table declares, and a test that invented it
 * would pass against a component checking nothing.
 *
 * @param url - the address somebody pasted.
 * @returns the resolution.
 */
function embedFor(url: string): ResolvedEmbed {
  const embed = resolveEmbed(url);
  if (!embed) throw new Error(`nothing resolves ${url}`);
  return embed;
}

/**
 * Renders one frame and hands back the parts a test asserts against.
 *
 * @param url - the address somebody pasted.
 * @returns the resolution, the `<iframe>` and the box sizing it.
 */
function mount(url: string) {
  const embed = embedFor(url);
  render(<EmbedFrame embed={embed} title="a post" className="h-150 w-full" />);
  const frame = screen.getByTitle("a post") as HTMLIFrameElement;
  const box = frame.parentElement;
  if (!box) throw new Error("the frame is not in a box");
  return { embed, frame, box };
}

/**
 * Delivers one message to the page, as a frame would.
 *
 * @param origin - who it claims to be from.
 * @param source - which window actually sent it.
 * @param data - the payload.
 */
function deliver(origin: string, source: Window | null, data: unknown) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin, source, data }));
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("a frame whose provider volunteers its height", () => {
  it("paints at the shape's own height until anything is reported", () => {
    const { frame, box } = mount("https://t.me/channelname/123");
    expect(box.className).toContain("h-150");
    expect(box.style.height).toBe("");
    expect(frame.style.height).toBe("100%");
  });

  it("takes the height X/Twitter posts", () => {
    const { embed, frame, box } = mount("https://x.com/user/status/20");
    deliver(embed.origin, frame.contentWindow, {
      "twttr.embed": {
        method: "twttr.private.resize",
        params: [{ width: 420, height: 225 }],
      },
    });
    // **On the FRAME, not on the box.** The box carries the border and every
    // element here is `border-box`, so a height put on the box is the
    // border's to spend first and the provider gets two pixels less than it
    // asked for. The box takes `auto` and sizes itself to the frame.
    expect(frame.style.height).toBe("225px");
    expect(box.style.height).toBe("auto");
  });

  it("takes the height Instagram posts, as the JSON string it sends", () => {
    const { embed, frame, box } = mount("https://www.instagram.com/p/Abc12");
    deliver(
      embed.origin,
      frame.contentWindow,
      '{"details":{"height":444},"type":"MEASURE"}',
    );
    expect(frame.style.height).toBe("444px");
    expect(box.style.height).toBe("auto");
  });

  it("takes a fresh height when the frame re-posts after a width change", () => {
    const { embed, frame } = mount("https://t.me/channelname/123");
    deliver(
      embed.origin,
      frame.contentWindow,
      '{"event":"resize","height":781}',
    );
    expect(frame.style.height).toBe("781px");
    deliver(
      embed.origin,
      frame.contentWindow,
      '{"event":"resize","height":741}',
    );
    expect(frame.style.height).toBe("741px");
  });

  it("ignores a message that carries no height", () => {
    const { embed, frame } = mount("https://t.me/channelname/123");
    deliver(embed.origin, frame.contentWindow, '{"event":"ready"}');
    expect(frame.style.height).toBe("100%");
  });
});

// THE TWO CHECKS ARE THE WHOLE GUARD, and each fails silently without the
// other: origin alone lets any frame on the page resize every other frame from
// the same provider, and source alone lets any frame at all claim a height.
describe("what a frame is allowed to claim about itself", () => {
  it("refuses a height from another origin", () => {
    const { frame } = mount("https://t.me/channelname/123");
    deliver(
      "https://evil.example",
      frame.contentWindow,
      '{"event":"resize","height":781}',
    );
    expect(frame.style.height).toBe("100%");
  });

  it("refuses a height from a window that is not this frame", () => {
    const { embed, frame } = mount("https://t.me/channelname/123");
    deliver(embed.origin, window, '{"event":"resize","height":781}');
    expect(frame.style.height).toBe("100%");
  });

  it("refuses a height from a message with no source at all", () => {
    const { embed, frame } = mount("https://t.me/channelname/123");
    deliver(embed.origin, null, '{"event":"resize","height":781}');
    expect(frame.style.height).toBe("100%");
  });
});

describe("a frame whose provider says nothing", () => {
  // Spotify is measured rather than asked, so its box is right from the server
  // and no listener should be attached at all — a message reaching it would
  // mean the map had grown an entry nothing measured.
  it("paints at its measured height and takes nothing from a message", () => {
    const { frame, box } = mount(
      "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT",
    );
    expect(frame.style.height).toBe("152px");
    expect(box.style.height).toBe("auto");
    deliver(
      "https://open.spotify.com",
      frame.contentWindow,
      '{"event":"resize","height":781}',
    );
    expect(frame.style.height).toBe("152px");
  });
});

describe("a Mastodon frame, which has to be asked", () => {
  const POST = "https://mastodon.social/@user/117111027223007552";

  it("collapses the frame while asking, and never the box", () => {
    const { frame, box } = mount(POST);
    // The box holds the page still; the frame inside is what has to be short,
    // because an instance answers `max(content, frame height)`.
    expect(frame.style.height).toBe("1px");
    expect(box.className).toContain("h-150");
    expect(box.style.height).toBe("");
  });

  it("asks only once the frame has a document of its own", () => {
    const { embed, frame } = mount(POST);
    const contentWindow = frame.contentWindow;
    if (!contentWindow) throw new Error("no content window");
    const post = vi.spyOn(contentWindow, "postMessage");
    expect(post).not.toHaveBeenCalled();
    fireEvent.load(frame);
    expect(post).toHaveBeenCalledWith(
      { type: "setHeight", id: "aeleos" },
      // The provider's exact origin, never `*`.
      embed.origin,
    );
  });

  it("applies the answer and gives the frame its height back", () => {
    const { embed, frame, box } = mount(POST);
    fireEvent.load(frame);
    deliver(embed.origin, frame.contentWindow, {
      type: "setHeight",
      id: "aeleos",
      height: 337,
    });
    expect(frame.style.height).toBe("337px");
    expect(box.style.height).toBe("auto");
  });

  // An instance that is down — or one answering a federated post's `/embed`
  // with a framed-denied 404 — replies to nothing, ever. Without the give-up
  // the frame would stay one pixel tall for the rest of the visit.
  it("gives up and shows the post at its resting height", () => {
    vi.useFakeTimers();
    const { frame, box } = mount(POST);
    fireEvent.load(frame);
    expect(frame.style.height).toBe("1px");
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(frame.style.height).toBe("100%");
    expect(box.style.height).toBe("");
  });

  it("stops asking once it has been answered", () => {
    vi.useFakeTimers();
    const { embed, frame } = mount(POST);
    const contentWindow = frame.contentWindow;
    if (!contentWindow) throw new Error("no content window");
    const post = vi.spyOn(contentWindow, "postMessage");
    fireEvent.load(frame);
    deliver(embed.origin, frame.contentWindow, {
      type: "setHeight",
      height: 754,
    });
    const asked = post.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(post.mock.calls.length).toBe(asked);
  });

  // A width change is the only thing that makes a Mastodon height stale, and
  // the instance volunteers nothing — so the observer has to re-run the whole
  // collapse-and-ask cycle rather than merely re-post.
  it("asks again when its width changes", () => {
    const observers: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          observers.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    try {
      const { embed, frame } = mount(POST);
      const contentWindow = frame.contentWindow;
      if (!contentWindow) throw new Error("no content window");
      const post = vi.spyOn(contentWindow, "postMessage");
      fireEvent.load(frame);
      deliver(embed.origin, frame.contentWindow, {
        type: "setHeight",
        height: 754,
      });
      expect(frame.style.height).toBe("754px");
      const asked = post.mock.calls.length;
      const observed = observers.at(-1);
      if (!observed) throw new Error("nothing observed the frame");
      act(() => {
        observed(
          [{ contentRect: { width: 300 } } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });
      expect(frame.style.height).toBe("1px");
      expect(post.mock.calls.length).toBeGreaterThan(asked);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
