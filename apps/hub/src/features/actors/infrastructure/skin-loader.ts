import {
  readSkinArchive,
  type SkinArchiveProblem,
} from "@/features/actors/domain/wsz";

/** Why a skin could not be loaded, in words a caller can translate. */
export type SkinProblem = SkinArchiveProblem | "unreachable";

/**
 * A skin that loaded, and the way to let go of it.
 *
 * **`revoke` is not optional politeness.** Every sheet is an object URL holding
 * its blob alive for as long as the document lives, and a classic skin is a
 * megabyte of uncompressed bitmaps. A page whose visitor changes skin a few
 * times, or an editor previewing one skin after another, leaks all of them —
 * so whoever loads a skin owns letting it go, and the component that mounts one
 * revokes on unmount and on replacement.
 */
export interface LoadedSkin {
  /** Each sheet's object URL, by the lowercased basename the atlas uses. */
  readonly sheets: ReadonlyMap<string, string>;
  /** Releases every object URL. Safe to call more than once. */
  revoke(): void;
}

/** What {@link loadSkin} answers. */
export type SkinResult =
  | { readonly ok: true; readonly skin: LoadedSkin }
  | { readonly ok: false; readonly reason: SkinProblem };

/**
 * The MIME type object URLs are minted with.
 *
 * Classic skins are Windows BMP whatever the extension says, and a browser
 * sniffs the bytes for an `<img>` or a `background-image` regardless — but a
 * blob with no type at all is served as `application/octet-stream`, which some
 * download paths treat as a file to save rather than a picture to draw.
 */
const SHEET_TYPE = "image/bmp";

/**
 * Fetches a `.wsz` and turns it into sheets a stylesheet can point at.
 *
 * **The address is somebody's, and so is whether it works.** Skins come from
 * the Winamp Skin Museum's CDN, from our own set, or from any host a person
 * pasted — and the third of those carries no promise of being reachable or of
 * sending CORS. So every failure is a value here rather than an exception:
 * `unreachable` covers a network error, a non-2xx answer and a CORS refusal
 * alike, because a browser deliberately reports all three identically and
 * pretending to tell them apart would be a lie in the message shown to
 * somebody.
 *
 * The three reasons exist because they need different words. `unreachable` is
 * usually a dead link or a host without CORS; `not-an-archive` is usually an
 * HTML error page served with a 200; `no-sprites` is usually a zip of something
 * that is not a skin at all.
 *
 * **Nothing is cached here.** A browser's own HTTP cache already covers the
 * repeat visit, and a module-level cache would hold every skin a session ever
 * looked at alive for the life of the tab — which is exactly what
 * {@link LoadedSkin.revoke} exists to prevent.
 *
 * @param url - the skin's address.
 * @param signal - aborts the fetch when the caller goes away.
 * @returns the loaded skin, or why there is none.
 */
export async function loadSkin(
  url: string,
  signal?: AbortSignal,
): Promise<SkinResult> {
  let archive: ArrayBuffer;
  try {
    const response = await fetch(url, { signal, mode: "cors" });
    if (!response.ok) return { ok: false, reason: "unreachable" };
    archive = await response.arrayBuffer();
  } catch {
    // A network error, a CORS refusal and an abort are one outcome to a caller:
    // there is no skin. Telling them apart is not possible from here anyway —
    // the browser reports CORS as a bare TypeError on purpose.
    return { ok: false, reason: "unreachable" };
  }

  const read = await readSkinArchive(archive);
  if (!read.ok) return { ok: false, reason: read.reason };

  const urls: string[] = [];
  const sheets = new Map<string, string>();
  for (const [name, bytes] of read.files) {
    const objectUrl = URL.createObjectURL(
      new Blob([bytes], { type: SHEET_TYPE }),
    );
    urls.push(objectUrl);
    sheets.set(name, objectUrl);
  }

  let revoked = false;
  return {
    ok: true,
    skin: {
      sheets,
      revoke() {
        // Idempotent: a component that revokes on unmount AND on replacement
        // will call this twice for the same skin in a fast swap, and revoking
        // an already-revoked URL is harmless but the flag makes it obvious.
        if (revoked) return;
        revoked = true;
        for (const one of urls) URL.revokeObjectURL(one);
      },
    },
  };
}
