import type { SupabaseClient } from "@supabase/supabase-js";
import { refuseImage } from "@/features/actors/domain/image-limits";

/** The bucket `0013` creates. */
const BUCKET = "actor-images";

/** Raised when a file breaks a limit, so a field can say which. */
export class ImageRefusedError extends Error {
  /** Which rule it broke. */
  readonly reason: "size" | "type";

  /** @param reason - which rule the file broke. */
  constructor(reason: "size" | "type") {
    super(`image refused: ${reason}`);
    this.name = "ImageRefusedError";
    this.reason = reason;
  }
}

/**
 * The folder every one of an actor's images lives in.
 *
 * **The shape is part of the contract, not a convention.** `0013`'s policies
 * read the actor's ref out of the path with `storage.foldername`, so a file
 * written anywhere else is refused rather than landing somewhere unowned.
 *
 * @param actorRef - whose folder.
 * @returns the prefix, without a trailing slash.
 */
const folderFor = (actorRef: string) => `actor/${actorRef}`;

/**
 * Uploads one picture and returns the URL to store.
 *
 * The file is checked against `IMAGE_LIMITS` **before** anything is sent, so a
 * refusal is immediate rather than arriving after a slow upload on a phone. The
 * bucket enforces the same numbers and is the authority; this is the courtesy.
 *
 * The object is named with a fresh UUID rather than the file's own name. Two
 * reasons: a person's filenames are their business and need not become public,
 * and uploading `avatar.png` twice must not silently replace the first one.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - the actor the picture belongs to.
 * @param file - the chosen file.
 * @returns the public URL, ready to put in `avatar_url` or `image_url`.
 * @throws `ImageRefusedError` when the file breaks a limit — nothing is
 * uploaded in that case.
 * @throws when storage refuses the write, carrying its message. The caller must
 * not treat that as an empty URL.
 */
export async function uploadActorImage(
  client: SupabaseClient,
  actorRef: string,
  file: File,
): Promise<string> {
  const refusal = refuseImage(file.type, file.size);
  if (refusal) throw new ImageRefusedError(refusal);

  const extension = file.type.replace("image/", "");
  const path = `${folderFor(actorRef)}/${crypto.randomUUID()}.${extension}`;

  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) throw new Error(`Could not upload the image: ${error.message}`);

  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Removes every picture an actor owns.
 *
 * Called by `deleteFursona` **before** the row is marked, and that order is
 * forced: the storage delete policy resolves through `owns_active_actor`, so
 * once the fursona is deleted its owner can no longer remove its pictures.
 * `0013` explains why the database cannot do this itself: Supabase refuses
 * direct deletion from the storage tables outright.
 *
 * Removing nothing is success, not failure — a fursona that never had a picture
 * must still be deletable, and a retry after a partial removal must not be
 * refused for finding the work already done.
 *
 * @param client - a Supabase client authenticated as the person.
 * @param actorRef - whose pictures to remove.
 * @throws when listing or removing fails, so the caller can stop rather than
 * delete a fursona whose images would then be stranded.
 */
export async function removeActorImages(
  client: SupabaseClient,
  actorRef: string,
): Promise<void> {
  const folder = folderFor(actorRef);

  const { data, error } = await client.storage.from(BUCKET).list(folder);
  if (error) throw new Error(`Could not read the images: ${error.message}`);

  const paths = (data ?? []).map((entry) => `${folder}/${entry.name}`);
  if (paths.length === 0) return;

  const { error: removeError } = await client.storage
    .from(BUCKET)
    .remove(paths);
  if (removeError)
    throw new Error(`Could not remove the images: ${removeError.message}`);
}
