import { describe, expect, it } from "vitest";

import { readSkinArchive } from "@/features/actors/domain/wsz";

interface Entry {
  name: string;
  bytes: Uint8Array<ArrayBuffer>;
  /** 0 = stored, 8 = deflated, anything else = a method the reader skips. */
  method?: number;
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

/**
 * The bytes as a plain array, which is the only realm-proof way to compare
 * them here.
 *
 * **Vitest's jsdom environment has TWO `Uint8Array` realms.**
 * `new TextEncoder().encode()` answers Node's while the global `Uint8Array` is
 * jsdom's, so `encoded instanceof Uint8Array` is FALSE and `toEqual` refuses
 * the comparison — while printing both sides as byte-identical and reporting
 * "Compared values have no visual difference". Every assertion here therefore
 * compares content rather than typed arrays.
 */
const bytesOf = (
  bytes: Uint8Array<ArrayBuffer> | undefined,
): number[] | undefined => (bytes === undefined ? undefined : [...bytes]);

async function deflate(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  const out = await new Response(
    source.pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  return new Uint8Array(out);
}

/**
 * Builds a ZIP with a real central directory, so the reader is not humoured.
 *
 * Synthetic rather than a checked-in museum skin on purpose: this can be made
 * far more hostile than any real archive — three levels deep, mixed casing, a
 * compression method nobody uses — and it keeps somebody else's artwork out of
 * the repository.
 */
async function makeZip(entries: Entry[]): Promise<Uint8Array<ArrayBuffer>> {
  const locals: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 0;
    const payload = method === 8 ? await deflate(entry.bytes) : entry.bytes;
    const name = utf8(entry.name);

    const local = new Uint8Array(30 + name.length + payload.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, payload.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(payload, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, payload.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const directorySize = centrals.reduce((sum, one) => sum + one.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);

  const zip = new Uint8Array(offset + directorySize + end.length);
  let at = 0;
  for (const one of [...locals, ...centrals, end]) {
    zip.set(one, at);
    at += one.length;
  }
  return zip;
}

const main = utf8("BM main pixels");

describe("readSkinArchive", () => {
  it("reads a stored entry", async () => {
    const zip = await makeZip([{ name: "main.bmp", bytes: main }]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytesOf(result.files.get("main.bmp"))).toEqual([...main]);
  });

  it("inflates a deflated entry", async () => {
    // Repetitive so DEFLATE genuinely compresses it. A payload that deflated
    // LARGER than it started would let a stored-only reader pass this case.
    const bytes = utf8(`BM${"x".repeat(4000)}`);
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      { name: "cbuttons.bmp", bytes, method: 8 },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytesOf(result.files.get("cbuttons.bmp"))).toEqual([...bytes]);
  });

  it("keys on the basename, however deep", async () => {
    const zip = await makeZip([
      { name: "3DNow/deeper/main.bmp", bytes: main, method: 8 },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.files.keys()]).toEqual(["main.bmp"]);
  });

  it("lowercases the key", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      { name: "Skin/SHUFREP.BMP", bytes: utf8("shuf") },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytesOf(result.files.get("shufrep.bmp"))).toEqual([...utf8("shuf")]);
  });

  it("prefers the shallower of two entries with one name", async () => {
    // The deep one comes FIRST, so a reader that merely keeps whichever it saw
    // first would pass by accident. Rule 27: the fixture has to be able to tell
    // the right behaviour from the wrong one.
    const zip = await makeZip([
      { name: "old/main.bmp", bytes: utf8("deep") },
      { name: "main.bmp", bytes: utf8("shallow") },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytesOf(result.files.get("main.bmp"))).toEqual([...utf8("shallow")]);
  });

  it("keeps the first of two entries at equal depth", async () => {
    const zip = await makeZip([
      { name: "a/main.bmp", bytes: utf8("first") },
      { name: "b/main.bmp", bytes: utf8("second") },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(bytesOf(result.files.get("main.bmp"))).toEqual([...utf8("first")]);
  });

  it("skips directory entries", async () => {
    const zip = await makeZip([
      { name: "3DNow/", bytes: new Uint8Array(0) },
      { name: "3DNow/main.bmp", bytes: main },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.files.keys()]).toEqual(["main.bmp"]);
  });

  it("skips an entry compressed by a method it cannot read, and keeps the rest", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      { name: "weird.bmp", bytes: utf8("bzip2?"), method: 12 },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.has("main.bmp")).toBe(true);
    expect(result.files.has("weird.bmp")).toBe(false);
  });

  it("skips an entry that claims DEFLATE and is not, and keeps the rest", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: main },
      // Stored bytes labelled as deflated: the inflate throws, and one bad
      // sheet must not cost the skin its other nineteen.
      { name: "titlebar.bmp", bytes: utf8("not deflate at all") },
    ]);
    // Rewrite the second entry's method in both headers, which is where a
    // corrupt archive differs from one this helper can build directly.
    const view = new DataView(zip.buffer);
    for (let at = 0; at + 4 <= zip.length; at++) {
      const signature = view.getUint32(at, true);
      const isLocal = signature === 0x04034b50;
      const isCentral = signature === 0x02014b50;
      if (!isLocal && !isCentral) continue;
      const nameAt = isLocal ? at + 30 : at + 46;
      const nameLength = view.getUint16(isLocal ? at + 26 : at + 28, true);
      const name = new TextDecoder().decode(
        zip.subarray(nameAt, nameAt + nameLength),
      );
      if (name === "titlebar.bmp")
        view.setUint16(isLocal ? at + 8 : at + 10, 8, true);
    }
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.has("main.bmp")).toBe(true);
    expect(result.files.has("titlebar.bmp")).toBe(false);
  });

  it("skips an entry with no name at all", async () => {
    const zip = await makeZip([
      { name: "", bytes: utf8("nameless") },
      { name: "main.bmp", bytes: main },
    ]);
    const result = await readSkinArchive(zip.buffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.files.keys()]).toEqual(["main.bmp"]);
  });

  it("refuses an archive whose local header sits past the end", async () => {
    // A central directory can point anywhere; the payload it names has to be
    // bounds-checked before it is read, or a hostile archive reads whatever
    // memory follows.
    const zip = await makeZip([{ name: "main.bmp", bytes: main }]);
    const view = new DataView(zip.buffer);
    const central = zip.length - 22 - (46 + "main.bmp".length);
    view.setUint32(central + 42, zip.length - 4, true);
    const result = await readSkinArchive(zip.buffer);
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses something that is not an archive", async () => {
    const result = await readSkinArchive(
      utf8("<!doctype html><h1>404</h1>").buffer,
    );
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses an empty input", async () => {
    const result = await readSkinArchive(new ArrayBuffer(0));
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses an archive with no main.bmp", async () => {
    const zip = await makeZip([{ name: "readme.txt", bytes: utf8("hi") }]);
    const result = await readSkinArchive(zip.buffer);
    expect(result).toEqual({ ok: false, reason: "no-sprites" });
  });

  it("refuses an archive whose directory offset points at something else", async () => {
    // Bytes are there to read; they are simply not a central-directory record.
    // Offset 0 is the first LOCAL header, whose signature differs — which is a
    // different fault from the truncation case below, and a different branch.
    const zip = await makeZip([
      { name: "main.bmp", bytes: utf8("x".repeat(200)) },
    ]);
    new DataView(zip.buffer).setUint32(zip.length - 22 + 16, 0, true);
    const result = await readSkinArchive(zip.buffer);
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses an archive whose central directory is truncated", async () => {
    const zip = await makeZip([
      { name: "main.bmp", bytes: utf8("x".repeat(2000)), method: 8 },
    ]);
    // Keep the end record so it is found, but point it past the end.
    const view = new DataView(zip.buffer);
    view.setUint32(zip.length - 22 + 16, zip.length - 10, true);
    const result = await readSkinArchive(zip.buffer);
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });

  it("refuses an archive whose payload runs past the end", async () => {
    const zip = await makeZip([{ name: "main.bmp", bytes: main }]);
    // Claim the payload is far larger than the file.
    const view = new DataView(zip.buffer);
    const central = zip.length - 22 - (46 + "main.bmp".length);
    view.setUint32(central + 20, 999_999, true);
    const result = await readSkinArchive(zip.buffer);
    expect(result).toEqual({ ok: false, reason: "not-an-archive" });
  });
});
