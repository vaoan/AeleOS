import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const uploadActorImage = vi.fn();

vi.mock("@/shared/infrastructure/supabase-browser", () => ({
  useSupabaseBrowserClient: () => ({}),
}));

vi.mock("@/features/actors/infrastructure/actor-images", async () => {
  // The real error class, so `instanceof` in the component means something. A
  // stubbed one would let the branch pass while the production check failed.
  const actual = await vi.importActual<
    typeof import("@/features/actors/infrastructure/actor-images")
  >("@/features/actors/infrastructure/actor-images");
  return {
    ...actual,
    uploadActorImage: (...args: unknown[]) => uploadActorImage(...args),
  };
});

const { ImageField } =
  await import("@/features/actors/presentation/image-field");
const { ImageRefusedError } =
  await import("@/features/actors/infrastructure/actor-images");

const labels = {
  address: "Image address",
  upload: "Upload a picture",
  uploading: "Uploading…",
  tooLarge: "That file is over 2 MB.",
  wrongType: "That is not an image we can store.",
  failed: "The upload did not work. Try again.",
  staysPublic: "An uploaded image stays reachable by its address.",
};

const ACTOR = "3f2a9c00-0000-4000-8000-000000000000";

/**
 * Renders the field.
 *
 * `null` means "creating", not `undefined`. Passing `undefined` to a parameter
 * with a default TRIGGERS the default — so `renderField(undefined)` rendered
 * with the actor present and the "no upload while creating" case silently
 * tested the opposite of its name.
 *
 * @param actorRef - the actor, or null while creating.
 * @param value - what is already in the form.
 * @returns the change spy.
 */
function renderField(
  actorRef: string | null = ACTOR,
  value = "",
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(
    <ImageField
      actorRef={actorRef ?? undefined}
      value={value}
      onChange={onChange}
      labels={labels}
    />,
  );
  return onChange;
}

/** A file, without allocating one. */
const file = (type = "image/png") => new File(["x"], "picture.png", { type });

beforeEach(() => {
  uploadActorImage.mockReset().mockResolvedValue("https://db.test/a.png");
});

describe("ImageField", () => {
  // Both, on purpose: most furry art already lives on somebody else's gallery,
  // and forcing a re-upload to use this app would be hostile.
  it("offers the address field as well as the upload", () => {
    renderField();
    expect(screen.getByLabelText(labels.address)).toBeInTheDocument();
    expect(screen.getByText(labels.upload)).toBeInTheDocument();
  });

  it("reports what is typed into the address", () => {
    const onChange = renderField();
    fireEvent.change(screen.getByLabelText(labels.address), {
      target: { value: "https://elsewhere.test/art.png" },
    });
    expect(onChange).toHaveBeenCalledWith("https://elsewhere.test/art.png");
  });

  it("shows the address already in the form", () => {
    renderField(ACTOR, "https://elsewhere.test/art.png");
    expect(screen.getByLabelText(labels.address)).toHaveValue(
      "https://elsewhere.test/art.png",
    );
  });

  // Somebody choosing what to upload deserves to know this before they choose.
  it("warns that an uploaded image stays reachable", () => {
    renderField();
    expect(screen.getByText(labels.staysPublic)).toBeInTheDocument();
  });

  // An object's path carries the actor's ref, and there is no ref until the
  // fursona exists. Hiding the control says so rather than failing when pressed.
  it("offers no upload while the fursona is being created", () => {
    renderField(null);
    expect(screen.queryByText(labels.upload)).toBeNull();
    expect(screen.getByLabelText(labels.address)).toBeInTheDocument();
  });

  describe("uploading", () => {
    /** Picks a file in the hidden input. */
    const choose = (f: File) =>
      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [f] },
      });

    it("uploads the chosen file and reports its address", async () => {
      const onChange = renderField();
      choose(file());

      await waitFor(() =>
        expect(onChange).toHaveBeenCalledWith("https://db.test/a.png"),
      );
      expect(uploadActorImage).toHaveBeenCalledWith(
        expect.anything(),
        ACTOR,
        expect.anything(),
      );
    });

    it("does nothing when no file was chosen", () => {
      renderField();
      fireEvent.change(document.querySelector('input[type="file"]')!, {
        target: { files: [] },
      });
      expect(uploadActorImage).not.toHaveBeenCalled();
    });

    it("says so when the file is too large", async () => {
      uploadActorImage.mockRejectedValue(new ImageRefusedError("size"));
      const onChange = renderField();
      choose(file());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        labels.tooLarge,
      );
      // The field keeps whatever was there; a refusal must not blank it.
      expect(onChange).not.toHaveBeenCalled();
    });

    it("says so when the file is the wrong kind", async () => {
      uploadActorImage.mockRejectedValue(new ImageRefusedError("type"));
      renderField();
      choose(file("application/pdf"));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        labels.wrongType,
      );
    });

    // A failed upload is not a refusal and must not be reported as one — the
    // person did nothing wrong and a retry may well work.
    it("reports a failed upload differently", async () => {
      uploadActorImage.mockRejectedValue(new Error("network gone"));
      renderField();
      choose(file());

      expect(await screen.findByRole("alert")).toHaveTextContent(labels.failed);
    });

    it("clears the problem when a later upload works", async () => {
      uploadActorImage.mockRejectedValueOnce(new Error("network gone"));
      renderField();
      choose(file());
      expect(await screen.findByRole("alert")).toBeInTheDocument();

      uploadActorImage.mockResolvedValue("https://db.test/b.png");
      choose(file());
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
  });
});
