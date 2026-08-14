import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ImageRefusedError,
  removeActorImages,
  uploadActorImage,
} from "@/features/actors/infrastructure/actor-images";
import { IMAGE_LIMITS } from "@/features/actors/domain/image-limits";

const upload = vi.fn();
const list = vi.fn();
const remove = vi.fn();
const getPublicUrl = vi.fn(() => ({
  data: { publicUrl: "https://db.test/public/x.png" },
}));

const from = vi.fn(() => ({ upload, list, remove, getPublicUrl }));
const client = { storage: { from } } as unknown as SupabaseClient;

const ACTOR = "3f2a9c00-0000-4000-8000-000000000000";

/**
 * A file of a given type and size, without allocating one.
 *
 * @param type - its MIME type.
 * @param size - its size in bytes.
 * @returns something shaped enough like a File for the code under test.
 */
const file = (type = "image/png", size = 1000) =>
  ({ type, size, name: "whatever.png" }) as unknown as File;

beforeEach(() => {
  upload.mockReset().mockResolvedValue({ error: null });
  list.mockReset().mockResolvedValue({ data: [], error: null });
  remove.mockReset().mockResolvedValue({ error: null });
  from.mockClear();
  vi.stubGlobal("crypto", { randomUUID: () => "fixed-uuid" });
});

describe("uploadActorImage", () => {
  it("writes under the actor's own folder", async () => {
    await uploadActorImage(client, ACTOR, file());
    expect(upload).toHaveBeenCalledWith(
      `actor/${ACTOR}/fixed-uuid.png`,
      expect.anything(),
      { contentType: "image/png" },
    );
  });

  // The path shape is what 0013's policies read the actor out of, so a file
  // written anywhere else is refused rather than landing somewhere unowned.
  it("uses the bucket", async () => {
    await uploadActorImage(client, ACTOR, file());
    expect(from).toHaveBeenCalledWith("actor-images");
  });

  it("returns the public URL", async () => {
    expect(await uploadActorImage(client, ACTOR, file())).toBe(
      "https://db.test/public/x.png",
    );
  });

  it("names the object by uuid, not by the file's own name", async () => {
    await uploadActorImage(client, ACTOR, file());
    expect(upload.mock.calls[0]?.[0]).not.toContain("whatever");
  });

  it("keeps the type's extension", async () => {
    await uploadActorImage(client, ACTOR, file("image/webp"));
    expect(upload.mock.calls[0]?.[0]).toContain(".webp");
  });

  // Refused BEFORE anything is sent, so somebody on a phone hears about it
  // immediately rather than after the upload.
  describe("what it refuses without uploading", () => {
    it("refuses a file over the size limit", async () => {
      await expect(
        uploadActorImage(
          client,
          ACTOR,
          file("image/png", IMAGE_LIMITS.bytes + 1),
        ),
      ).rejects.toBeInstanceOf(ImageRefusedError);
      expect(upload).not.toHaveBeenCalled();
    });

    it("accepts a file exactly at the limit", async () => {
      await expect(
        uploadActorImage(client, ACTOR, file("image/png", IMAGE_LIMITS.bytes)),
      ).resolves.toBeDefined();
    });

    it("refuses a type the bucket does not store", async () => {
      await expect(
        uploadActorImage(client, ACTOR, file("application/pdf")),
      ).rejects.toBeInstanceOf(ImageRefusedError);
      expect(upload).not.toHaveBeenCalled();
    });

    it("says which rule was broken", async () => {
      await expect(
        uploadActorImage(client, ACTOR, file("application/pdf")),
      ).rejects.toMatchObject({ reason: "type" });
      await expect(
        uploadActorImage(client, ACTOR, file("image/png", 99_999_999)),
      ).rejects.toMatchObject({ reason: "size" });
    });
  });

  // Never an empty string: a caller that stored one would put a broken image in
  // somebody's page and report nothing.
  it("throws when storage refuses the write", async () => {
    upload.mockResolvedValue({ error: { message: "bucket full" } });
    await expect(uploadActorImage(client, ACTOR, file())).rejects.toThrow(
      /bucket full/,
    );
  });
});

describe("removeActorImages", () => {
  it("removes every object in the actor's folder", async () => {
    list.mockResolvedValue({
      data: [{ name: "a.png" }, { name: "b.png" }],
      error: null,
    });
    await removeActorImages(client, ACTOR);
    expect(remove).toHaveBeenCalledWith([
      `actor/${ACTOR}/a.png`,
      `actor/${ACTOR}/b.png`,
    ]);
  });

  // A fursona that never had a picture must still be deletable, and a retry
  // after a partial removal must not be refused for finding the work done.
  it("succeeds when there is nothing to remove", async () => {
    await expect(removeActorImages(client, ACTOR)).resolves.toBeUndefined();
    expect(remove).not.toHaveBeenCalled();
  });

  it("treats a null listing as nothing to remove", async () => {
    list.mockResolvedValue({ data: null, error: null });
    await expect(removeActorImages(client, ACTOR)).resolves.toBeUndefined();
  });

  it("throws when it cannot read the folder", async () => {
    list.mockResolvedValue({
      data: null,
      error: { message: "no such bucket" },
    });
    await expect(removeActorImages(client, ACTOR)).rejects.toThrow(
      /no such bucket/,
    );
  });

  // The caller stops on this rather than deleting the fursona anyway, because
  // after the row is marked its owner can no longer reach these objects.
  it("throws when the removal itself fails", async () => {
    list.mockResolvedValue({ data: [{ name: "a.png" }], error: null });
    remove.mockResolvedValue({ error: { message: "denied" } });
    await expect(removeActorImages(client, ACTOR)).rejects.toThrow(/denied/);
  });
});
