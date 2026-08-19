import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadSkin } from "@/features/actors/infrastructure/skin-loader";

const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

/**
 * A minimal ZIP holding one stored entry.
 *
 * The reader's own suite exercises the format exhaustively; this one only needs
 * something it will accept, so the archive is built by hand with no compression
 * rather than by importing the other suite's helper across files.
 */
function zipOf(name: string, bytes: Uint8Array<ArrayBuffer>): ArrayBuffer {
  const encoded = utf8(name);
  const local = new Uint8Array(30 + encoded.length + bytes.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint32(18, bytes.length, true);
  localView.setUint32(22, bytes.length, true);
  localView.setUint16(26, encoded.length, true);
  local.set(encoded, 30);
  local.set(bytes, 30 + encoded.length);

  const central = new Uint8Array(46 + encoded.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint32(20, bytes.length, true);
  centralView.setUint32(24, bytes.length, true);
  centralView.setUint16(28, encoded.length, true);
  centralView.setUint32(42, 0, true);
  central.set(encoded, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);

  const zip = new Uint8Array(local.length + central.length + end.length);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(end, local.length + central.length);
  return zip.buffer;
}

const minted: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  minted.length = 0;
  revoked.length = 0;
  // jsdom implements neither of these, so they are supplied rather than
  // spied on. This is not the "a suite that supplies setup the product does
  // not" trap: every real browser has both, and what is being observed is
  // that the loader CALLS them, in pairs.
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (blob: Blob) => {
      const url = `blob:sheet-${minted.length}-${blob.type}`;
      minted.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Answers one fetch with a body, or with a failure. */
function answerWith(result: Response | Error): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      result instanceof Error
        ? Promise.reject(result)
        : Promise.resolve(result),
    ),
  );
}

const skinZip = () => zipOf("3DNow/main.bmp", utf8("BM pixels"));

describe("loadSkin", () => {
  it("mints one object URL per sheet, keyed the way the atlas is", async () => {
    answerWith(new Response(skinZip(), { status: 200 }));
    const result = await loadSkin("https://r2.webampskins.org/skins/x.wsz");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.skin.sheets.keys()]).toEqual(["main.bmp"]);
    expect(result.skin.sheets.get("main.bmp")).toBe(minted[0]);
    expect(minted).toHaveLength(1);
  });

  it("types the blob as a bitmap", async () => {
    // A blob with no type is served as application/octet-stream, which some
    // paths treat as a file to save rather than a picture to draw.
    answerWith(new Response(skinZip(), { status: 200 }));
    const result = await loadSkin("https://example.test/x.wsz");
    expect(result.ok).toBe(true);
    expect(minted[0]).toContain("image/bmp");
  });

  it("revokes every URL it minted", async () => {
    answerWith(new Response(skinZip(), { status: 200 }));
    const result = await loadSkin("https://example.test/x.wsz");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.skin.revoke();
    expect(revoked).toEqual(minted);
  });

  it("revokes only once, however often it is asked", async () => {
    // A component revoking on unmount AND on replacement calls this twice for
    // one skin during a fast swap.
    answerWith(new Response(skinZip(), { status: 200 }));
    const result = await loadSkin("https://example.test/x.wsz");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.skin.revoke();
    result.skin.revoke();
    result.skin.revoke();
    expect(revoked).toHaveLength(minted.length);
  });

  it("reports a network error as unreachable", async () => {
    // A CORS refusal reaches script as a bare TypeError, deliberately
    // indistinguishable from a dead host. Claiming to tell them apart would be
    // a lie in the sentence shown to somebody.
    answerWith(new TypeError("Failed to fetch"));
    expect(await loadSkin("https://nope.test/x.wsz")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("reports a non-2xx answer as unreachable", async () => {
    answerWith(new Response("nope", { status: 404 }));
    expect(await loadSkin("https://example.test/missing.wsz")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });

  it("reports an error page served with a 200 as not-an-archive", async () => {
    // The common shape: a host that answers every path with its own HTML.
    answerWith(
      new Response("<!doctype html><h1>Not found</h1>", { status: 200 }),
    );
    expect(await loadSkin("https://example.test/x.wsz")).toEqual({
      ok: false,
      reason: "not-an-archive",
    });
  });

  it("reports a zip of something else as no-sprites", async () => {
    answerWith(
      new Response(zipOf("holiday.jpg", utf8("not a skin")), { status: 200 }),
    );
    expect(await loadSkin("https://example.test/x.zip")).toEqual({
      ok: false,
      reason: "no-sprites",
    });
  });

  it("mints nothing when the archive is refused", async () => {
    // Otherwise a run of bad addresses leaks a blob each, with no skin to hang
    // a `revoke` off.
    answerWith(new Response("<!doctype html>", { status: 200 }));
    await loadSkin("https://example.test/x.wsz");
    expect(minted).toEqual([]);
  });

  it("passes the abort signal to the fetch", async () => {
    answerWith(new Response(skinZip(), { status: 200 }));
    const controller = new AbortController();
    await loadSkin("https://example.test/x.wsz", controller.signal);
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/x.wsz",
      expect.objectContaining({ signal: controller.signal, mode: "cors" }),
    );
  });
});
