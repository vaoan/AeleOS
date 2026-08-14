/**
 * What `0013`'s bucket will accept, mirrored so somebody hears about a refusal
 * before a slow upload rather than after it.
 *
 * **The bucket is authoritative and this is a copy**, which is worth being
 * nervous about for the same reason `SECTION_LIMITS` is: a copy that drifts
 * either refuses what storage would have taken or promises what it will reject.
 * So it is not trusted to stay right —
 * `image-limits-match-migration.test.ts` reads the migration and fails if
 * either of these stops matching.
 *
 * Change one of these only by changing `0013` too. The guard will say so.
 */
export const IMAGE_LIMITS = {
  /** Bytes in one file. 2 MiB. */
  bytes: 2_097_152,
  /** The types the bucket will store. */
  types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
} as const;

/**
 * Whether a file is one the bucket would take.
 *
 * Two scalars rather than the file itself: an inline object parameter makes the
 * lint rules demand `@param file.size`, which the TSDoc syntax rule then
 * rejects for the dot. The repository resolves that collision this way
 * everywhere it appears.
 *
 * @param type - the file's MIME type.
 * @param size - its size in bytes.
 * @returns `undefined` when it is acceptable, or which rule it broke — `"size"`
 * or `"type"` — so a caller can say which without re-deriving the reason.
 */
export function refuseImage(
  type: string,
  size: number,
): "size" | "type" | undefined {
  if (!IMAGE_LIMITS.types.includes(type as (typeof IMAGE_LIMITS.types)[number]))
    return "type";
  if (size > IMAGE_LIMITS.bytes) return "size";
  return undefined;
}
