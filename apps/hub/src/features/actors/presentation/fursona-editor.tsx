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
  SectionEditor,
  type SectionEditorLabels,
} from "@/features/actors/presentation/section-editor";
import { useLanguageToggle } from "@/features/actors/application/use-language-toggle";
import type { FursonaSection } from "@/features/actors/domain/section-schema";
import {
  VISIBILITIES,
  fursonaSchema,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
import { sectionsSchema } from "@/features/actors/domain/section-schema";

/**
 * Translated strings {@link FursonaEditor} renders.
 *
 * Extends the toolbar's and the section editor's, because the editor owns one
 * label bag and hands slices of it down rather than each level resolving its
 * own — a component that resolved its own would need the catalogue in the
 * browser.
 */
export interface FursonaEditorLabels
  extends EditorToolbarLabels, SectionEditorLabels {
  /** Names the control that switches which language is being written. */
  writingIn: string;
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

/**
 * What {@link FursonaEditor} needs.
 *
 * `initialSections` is separate from `initial` because the two come from
 * different reads: the fields from `my_actors()`, the sections from
 * `actor_profiles`. `0013` deliberately did not join them.
 */
export interface FursonaEditorProps {
  /** Already-translated strings. */
  labels: FursonaEditorLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /** The fursona's existing sections, absent when creating. */
  initialSections?: FursonaSection[];
  /** The fursona being edited, absent when creating. */
  actorRef?: string;
  /** False when editing — the handle is then shown but not submitted. */
  handleEditable: boolean;
}

/** Where a save or a cancel returns to. */
const LIST = "/fursonas";

/**
 * The whole editor's shape: the four fields, plus the page's sections.
 *
 * Composed from the two schemas rather than restated, so neither the field
 * rules nor the section rules exist twice — and `sectionsSchema` is the same
 * one whose limits are checked against `0013` by
 * `section-limits-match-migration.test.ts`.
 */
const editorSchema = fursonaSchema.extend({ sections: sectionsSchema });

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
 * It now edits the page as well as the fursona: the four fields, a language
 * toggle, and the sections. Its schema is `fursonaSchema` extended with
 * `sectionsSchema`, composed rather than restated so neither set of rules
 * exists twice.
 *
 * **Navigation is decided by what `save` returns, never by reading
 * `fieldErrors` afterwards.** That value is captured from the render that built
 * the submit handler, so it is still empty when a save fails — and this editor
 * once navigated away on a refusal, hiding the reason and discarding what
 * somebody had typed.
 *
 * It hands `actorRef` to the section editor as well as using it to save. An
 * uploaded image's path carries that ref, so a gallery item can only offer the
 * upload control once the fursona exists — while creating one, the field takes
 * a pasted address and nothing else.
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
  initialSections,
  actorRef,
  handleEditable,
}: FursonaEditorProps) {
  const router = useRouter();
  const { save, saving, fieldErrors } = useFursonaEditor(actorRef);
  const { lang, toggle } = useLanguageToggle();

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      handle: initial?.handle ?? "",
      displayName: initial?.displayName ?? "",
      avatarUrl: initial?.avatarUrl ?? "",
      visibility: initial?.visibility ?? "private",
      sections: initialSections ?? [],
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
        // The RETURN VALUE decides, never `fieldErrors`. That variable is
        // captured from the render that built this handler, so it is still
        // empty when the save fails — and the editor used to navigate away on
        // a refusal, hiding the reason and taking the person's typing with it.
        if (await save(values)) router.push(LIST);
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

      <div className="mt-8 flex items-center gap-3">
        <span className="text-sm text-[var(--muted)]">{labels.writingIn}</span>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={lang === "es"}
          className="rounded-lg border border-[var(--edge)]/60 px-3 py-1.5 text-sm"
        >
          {lang === "en" ? "EN" : "ES"}
        </button>
      </div>

      <SectionEditor
        control={control}
        register={register}
        lang={lang}
        actorRef={actorRef}
        labels={labels}
      />
    </form>
  );
}
