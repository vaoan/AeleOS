"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { useFursonaEditor } from "@/features/actors/application/use-fursona-editor";
import {
  EditorToolbar,
  type EditorToolbarLabels,
} from "@/features/actors/presentation/editor-toolbar";
import { FormErrorBanner } from "@/features/actors/presentation/form-error-banner";
import {
  VISIBILITIES,
  fursonaSchema,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";

/** Translated strings {@link FursonaEditor} renders. */
export interface FursonaEditorLabels extends EditorToolbarLabels {
  /** Shown in the toolbar: what is being edited. */
  title: string;
  /** Field labels. */
  handle: string;
  /** Guidance under the handle field. */
  handleHint: string;
  /** Field label. */
  displayName: string;
  /** Field label. */
  avatarUrl: string;
  /** Field label. */
  visibilityLabel: string;
  /** The error banner's heading. */
  bannerTitle: string;
  /** One label per visibility value. */
  visibility: Record<Visibility, string>;
  /** One message per error code, keyed by code. */
  errors: Record<string, string>;
}

/** What {@link FursonaEditor} needs. */
export interface FursonaEditorProps {
  /** Already-translated strings. */
  labels: FursonaEditorLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /** The fursona being edited, absent when creating. */
  actorRef?: string;
  /** False when editing — the handle is then shown but not submitted. */
  handleEditable: boolean;
}

/** Where a save or a cancel returns to. */
const LIST = "/fursonas";

/**
 * The fursona editor: a full-page form under a sticky toolbar.
 *
 * Replaces `FursonaForm` and the server actions behind it. react-hook-form
 * rather than `useActionState`, because phase 4b's sections need
 * `useFieldArray` — which a server action cannot drive.
 *
 * Validation reuses `fursonaSchema` through `zodResolver` rather than
 * restating the rules. `fursona-schema.test.ts` already pins them, and a second
 * copy would drift from the one the database enforces.
 *
 * Two error sources meet in one banner: what the schema rejected before
 * anything was sent, and what the database refused afterwards. Both are codes,
 * both look up in `labels.errors`, and the person does not need to know which
 * came from where.
 *
 * @returns the editor.
 */
export function FursonaEditor({
  labels,
  initial,
  actorRef,
  handleEditable,
}: FursonaEditorProps) {
  const router = useRouter();
  const { save, saving, fieldErrors } = useFursonaEditor(actorRef);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FursonaInput>({
    resolver: zodResolver(fursonaSchema),
    defaultValues: {
      handle: initial?.handle ?? "",
      displayName: initial?.displayName ?? "",
      avatarUrl: initial?.avatarUrl ?? "",
      visibility: initial?.visibility ?? "private",
    },
  });

  // Schema failures carry a zod code; the database's refusals carry ours. The
  // banner reads both the same way, so this only has to flatten them.
  const schemaErrors = Object.fromEntries(
    Object.entries(errors).map(([field]) => [field, field]),
  );

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await save(values);
        // Only on a clean save. A refusal sets fieldErrors and leaves the
        // person here with the reason showing, which is the only useful place
        // to be — navigating away would hide it.
        if (Object.keys(fieldErrors).length === 0) router.push(LIST);
      })}
    >
      <EditorToolbar
        title={labels.title}
        labels={labels}
        saving={saving}
        onCancel={() => router.push(LIST)}
      />

      <FormErrorBanner
        errors={{ ...schemaErrors, ...fieldErrors }}
        labels={{ title: labels.bannerTitle, errors: labels.errors }}
      />

      {/* Explicit htmlFor/id rather than wrapping each input in its label.
          A wrapping label takes its whole text content as the field's
          accessible name, so the handle's hint became part of the name and it
          announced as "Handle 1-32 characters." The hint is attached with
          aria-describedby instead, which is what it is for. */}
      <div className="grid gap-6">
        <div className="grid gap-1.5">
          <label htmlFor="handle" className="text-sm font-medium">
            {labels.handle}
          </label>
          {handleEditable ? (
            <>
              <input
                id="handle"
                {...register("handle")}
                maxLength={32}
                aria-invalid={Boolean(errors.handle)}
                aria-describedby="handle-hint"
                className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
              />
              <span id="handle-hint" className="text-xs text-[var(--muted)]">
                {labels.handleHint}
              </span>
            </>
          ) : (
            // Read-only text rather than a disabled input: update_fursona takes
            // no handle at all, so an editable one would submit a value the
            // database ignores.
            <span className="px-3 py-2 font-mono text-sm text-[var(--muted)]">
              @{initial?.handle}
            </span>
          )}
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="displayName" className="text-sm font-medium">
            {labels.displayName}
          </label>
          <input
            id="displayName"
            {...register("displayName")}
            maxLength={64}
            aria-invalid={Boolean(errors.displayName)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="avatarUrl" className="text-sm font-medium">
            {labels.avatarUrl}
          </label>
          <input
            id="avatarUrl"
            {...register("avatarUrl")}
            type="url"
            aria-invalid={Boolean(errors.avatarUrl)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="visibility" className="text-sm font-medium">
            {labels.visibilityLabel}
          </label>
          <select
            id="visibility"
            {...register("visibility")}
            aria-invalid={Boolean(errors.visibility)}
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
          >
            {VISIBILITIES.map((value) => (
              <option key={value} value={value}>
                {labels.visibility[value]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </form>
  );
}
