/**
 * The end-of-central-directory signature, `PK\5\6`.
 *
 * Searched backwards from the end, because a ZIP may carry a trailing comment
 * of up to 65,535 bytes after this record.
 */
const END_SIGNATURE = 0x06054b50;

/** The central-directory file-header signature, `PK\1\2`. */
const CENTRAL_SIGNATURE = 0x02014b50;

/** How long an end-of-central-directory record is, with no comment. */
const END_LENGTH = 22;

/** How long one central-directory file header is, before its name. */
const CENTRAL_LENGTH = 46;

/** How long one local file header is, before its name. */
const LOCAL_LENGTH = 30;

/** Stored: the payload is the file. */
const METHOD_STORED = 0;

/** Deflated: the payload is raw DEFLATE, which the platform can inflate. */
const METHOD_DEFLATE = 8;

/**
 * The one sheet every classic skin has.
 *
 * Its absence is what separates "this zip is not a skin" from "this is not a
 * zip", and the two need different words in front of somebody.
 */
const REQUIRED_SHEET = "main.bmp";

/** Why an archive could not be read as a skin. */
export type SkinArchiveProblem = "not-an-archive" | "no-sprites";

/**
 * A skin's files, or the reason there are none.
 *
 * Keys are **lowercased basenames** — `main.bmp`, never `3DNow/main.bmp` and
 * never `MAIN.BMP`. `skin-sprites.ts` names its sheets by exactly those
 * strings, and that convention is the whole join between the two modules.
 */
export type SkinArchive =
  | {
      readonly ok: true;
      readonly files: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
    }
  | { readonly ok: false; readonly reason: SkinArchiveProblem };

/**
 * Inflates one raw-DEFLATE payload.
 *
 * **Never through a `Blob`, and that is load-bearing rather than stylistic.**
 * jsdom supplies its own `Blob` without `.stream()` and it shadows Node's, so
 * `new Blob([bytes]).stream()` works in a browser and throws
 * `(intermediate value).stream is not a function` in the unit suite — naming
 * `Blob` rather than the environment, which makes it a slow diagnosis.
 * Feeding a `ReadableStream` sidesteps the question and allocates less.
 *
 * The source is a `ReadableStream<BufferSource>` because that is what a
 * compression stream's writable side actually takes; typing it as
 * `Uint8Array` makes `pipeThrough` reject the very stream it is handed.
 *
 * @param payload - the compressed bytes.
 * @returns the inflated bytes.
 * @throws when the payload is not valid DEFLATE. Callers treat that as a sheet
 * to skip rather than as a fatal archive error.
 */
async function inflate(
  payload: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
  const inflated = await new Response(
    source.pipeThrough(new DecompressionStream("deflate-raw")),
  ).arrayBuffer();
  return new Uint8Array(inflated);
}

/**
 * Finds the end-of-central-directory record.
 *
 * @param view - the whole archive.
 * @returns its offset, or -1 when there is none.
 */
function findEnd(view: DataView): number {
  for (let at = view.byteLength - END_LENGTH; at >= 0; at--) {
    if (view.getUint32(at, true) === END_SIGNATURE) return at;
  }
  return -1;
}

/**
 * How deep a stored path sits.
 *
 * @param name - the entry's path as the archive stores it.
 * @returns the number of separators in it.
 */
function depthOf(name: string): number {
  let depth = 0;
  for (const character of name) if (character === "/") depth++;
  return depth;
}

/** One entry as the central directory describes it. */
interface CentralRecord {
  /** The path exactly as stored, separators and case included. */
  readonly name: string;
  /** The compression method, which only 0 and 8 are read. */
  readonly method: number;
  /** How many bytes the payload occupies. */
  readonly compressedSize: number;
  /** Where this entry's local header starts. */
  readonly localAt: number;
  /** Where the next central record starts. */
  readonly next: number;
}

/**
 * Reads one central-directory record.
 *
 * @param bytes - the whole archive.
 * @param view - a view over the same bytes.
 * @param at - where this record starts.
 * @returns the record, or null when the directory is malformed there.
 */
function readCentralRecord(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  at: number,
): CentralRecord | null {
  if (at + CENTRAL_LENGTH > bytes.length) return null;
  if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) return null;
  const nameLength = view.getUint16(at + 28, true);
  const extraLength = view.getUint16(at + 30, true);
  const commentLength = view.getUint16(at + 32, true);
  return {
    name: new TextDecoder().decode(
      bytes.subarray(at + CENTRAL_LENGTH, at + CENTRAL_LENGTH + nameLength),
    ),
    method: view.getUint16(at + 10, true),
    compressedSize: view.getUint32(at + 20, true),
    localAt: view.getUint32(at + 42, true),
    next: at + CENTRAL_LENGTH + nameLength + extraLength + commentLength,
  };
}

/**
 * Finds one entry's payload, bounds-checked against the archive.
 *
 * The check is not a formality: a central directory may point anywhere, so an
 * archive somebody pasted could otherwise name a range past the end.
 *
 * @param bytes - the whole archive.
 * @param view - a view over the same bytes.
 * @param record - the entry to locate.
 * @returns its raw payload, or null when the archive does not contain it.
 */
function payloadOf(
  bytes: Uint8Array<ArrayBuffer>,
  view: DataView,
  record: CentralRecord,
): Uint8Array<ArrayBuffer> | null {
  if (record.localAt + LOCAL_LENGTH > bytes.length) return null;
  const start =
    record.localAt +
    LOCAL_LENGTH +
    view.getUint16(record.localAt + 26, true) +
    view.getUint16(record.localAt + 28, true);
  if (start + record.compressedSize > bytes.length) return null;
  return bytes.subarray(start, start + record.compressedSize);
}

/**
 * Whether this record names something this reader can read at all.
 *
 * A directory entry is not a file, and a method other than stored or deflated
 * is one the platform cannot inflate — both are skipped rather than fatal,
 * because a skin is twenty files and one oddity must not cost the rest.
 *
 * @param record - the entry to judge.
 * @returns whether to go on and read its payload.
 */
function isReadable(record: CentralRecord): boolean {
  if (record.name.endsWith("/")) return false;
  return record.method === METHOD_STORED || record.method === METHOD_DEFLATE;
}

/**
 * The lookup key for a stored path: its basename, lower-cased.
 *
 * `slice` rather than `split("/").pop() ?? ""`, because an array from `split`
 * is never empty — that fallback is a branch no input can reach, and an
 * unreachable branch holds coverage below the threshold for ever with nothing
 * to write a case against.
 *
 * @param name - the path exactly as the archive stores it.
 * @returns the key, which is empty for an entry with no name.
 */
function keyOf(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1).toLowerCase();
}

/**
 * Reads a `.wsz` — an ordinary ZIP — into its sprite sheets.
 *
 * **Depth-tolerant and case-insensitive, because real skins need both.** The
 * first museum skin opened while designing this kept every file inside a
 * `3DNow/` folder, and spelled three of them `shufrep.BMP`, `Eqmain.bmp` and
 * `PLEDIT.TXT` beside a lower-case `main.bmp`. A reader keyed on the stored
 * path, or on case, finds nothing in it. Where two entries share a basename
 * the shallower wins, and the first wins a tie.
 *
 * **Refusing is an ordinary outcome and this never throws.** A pasted address
 * is about as likely to answer with an HTML error page as with a skin, and the
 * caller has somewhere to put either reason.
 *
 * **An entry it cannot read is skipped rather than fatal.** A skin is twenty
 * files, and one of them being compressed by something exotic — or claiming
 * DEFLATE and not being it — must not cost the other nineteen. A structural
 * fault in the archive itself is different, and refuses the whole thing.
 *
 * @param archive - the whole `.wsz`, as fetched.
 * @returns the files, or why there are none.
 */
export async function readSkinArchive(
  archive: ArrayBuffer,
): Promise<SkinArchive> {
  const bytes = new Uint8Array(archive);
  const view = new DataView(archive);
  const end = findEnd(view);
  if (end < 0) return { ok: false, reason: "not-an-archive" };

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);

  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const depths = new Map<string, number>();

  for (let index = 0; index < count; index++) {
    const record = readCentralRecord(bytes, view, at);
    if (!record) return { ok: false, reason: "not-an-archive" };
    at = record.next;

    if (!isReadable(record)) continue;

    const key = keyOf(record.name);
    if (!key) continue;

    const depth = depthOf(record.name);
    const seen = depths.get(key);
    if (seen !== undefined && seen <= depth) continue;

    const payload = payloadOf(bytes, view, record);
    if (!payload) return { ok: false, reason: "not-an-archive" };

    try {
      files.set(
        key,
        record.method === METHOD_DEFLATE ? await inflate(payload) : payload,
      );
      depths.set(key, depth);
    } catch {
      // Bytes that claim DEFLATE and are not. Dropped exactly like a method
      // this reader does not know, for the same reason: one bad sheet must not
      // cost a skin its other nineteen.
      continue;
    }
  }

  if (!files.has(REQUIRED_SHEET)) return { ok: false, reason: "no-sprites" };
  return { ok: true, files };
}
