"use client";

import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { useSupabaseBrowserClient } from "@/shared/infrastructure/supabase-browser";
import {
  ImageRefusedError,
  uploadActorImage,
} from "@/features/actors/infrastructure/actor-images";

/** Translated strings {@link ImageField} renders. */
export interface ImageFieldLabels {
  /** Field label for the address. */
  address: string;
  /** Names the upload control. */
  upload: string;
  /** Shown while a file is going up. */
  uploading: string;
  /** Shown when a file is too large. */
  tooLarge: string;
  /** Shown when a file is the wrong kind. */
  wrongType: string;
  /** Shown when the upload itself failed. */
  failed: string;
  /** The warning below — see the component's note. */
  staysPublic: string;
}

/** What {@link ImageField} needs. */
export interface ImageFieldProps {
  /** The actor the picture belongs to, or undefined while creating one. */
  actorRef: string | undefined;
  /** The address currently in the form. */
  value: string;
  /** Called with a new address, whether typed or uploaded. */
  onChange: (url: string) => void;
  /** Already-translated strings. */
  labels: ImageFieldLabels;
}

/**
 * An image address, typed or uploaded.
 *
 * **It offers both on purpose.** Most furry art already lives on somebody
 * else's gallery, and forcing a re-upload to use this app would be hostile — so
 * the text field that existed before is still here, and uploading simply fills
 * it in.
 *
 * **Upload is unavailable while creating**, because an object's path carries
 * the actor's ref and there is no ref until the fursona exists. Somebody
 * creating one pastes a link or saves first; the control says so rather than
 * failing when pressed.
 *
 * It warns, once and next to the control, that an uploaded image stays
 * reachable by its URL even after the fursona is made private. That is a real
 * property of a public bucket — see `0013` — and somebody choosing what to
 * upload deserves to know it before they choose, not after.
 *
 * A refused file names which rule it broke, and **nothing is uploaded** in that
 * case: the check runs before anything is sent, so a phone on a slow connection
 * hears about a 5 MB photograph immediately.
 *
 * @returns the field.
 */
export function ImageField({
  actorRef,
  value,
  onChange,
  labels,
}: ImageFieldProps) {
  const id = useId();
  const client = useSupabaseBrowserClient();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();

  /**
   * Uploads the chosen file and puts its address in the form.
   *
   * @param file - what the person picked.
   */
  const take = async (file: File): Promise<void> => {
    if (!actorRef) return;
    setProblem(undefined);
    setBusy(true);
    try {
      onChange(await uploadActorImage(client, actorRef, file));
    } catch (error) {
      setProblem(
        error instanceof ImageRefusedError
          ? error.reason === "size"
            ? labels.tooLarge
            : labels.wrongType
          : labels.failed,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <label htmlFor={`${id}-url`} className="text-xs font-medium">
        {labels.address}
      </label>
      <input
        id={`${id}-url`}
        type="url"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-1.5 text-sm"
      />

      {actorRef ? (
        <div className="grid gap-1.5">
          <label
            htmlFor={`${id}-file`}
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--edge)]/60 px-3 py-1.5 text-sm"
          >
            <Upload className="size-4" />
            {busy ? labels.uploading : labels.upload}
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept="image/*"
            disabled={busy}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void take(file);
            }}
          />
          <p className="text-xs text-[var(--muted)]">{labels.staysPublic}</p>
        </div>
      ) : null}

      {problem ? (
        <p role="alert" className="text-xs text-[var(--accent)]">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
