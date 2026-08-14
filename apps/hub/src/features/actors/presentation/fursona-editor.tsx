"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useController, useForm, type Control } from "react-hook-form";
import { useRouter } from "@/shared/infrastructure/i18n/navigation";
import { tid } from "@/shared/infrastructure/test-id";
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
import {
  ThemeConfigurator,
  type ThemeConfiguratorLabels,
} from "@/features/actors/presentation/theme-configurator";
import {
  DEFAULT_THEME,
  themeSchema,
  type ActorTheme,
} from "@/features/actors/domain/actor-theme";
import type { FursonaSection } from "@/features/actors/domain/section-schema";
import {
  VISIBILITIES,
  fursonaSchema,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";
import { sectionsSchema } from "@/features/actors/domain/section-schema";
import type { z } from "zod";

/**
 * Translated strings {@link FursonaEditor} renders.
 *
 * The theme panel's strings are **nested** under `theme` rather than flattened
 * in: both it and the toolbar have a `title`, and a flat bag would have one
 * silently win.
 *
 * `writingIn` is joined by `writingInHint` because the language switch has to
 * name itself and then say what it governs — this editor has an app language
 * and an authoring language, and the switch moves only the second.
 *
 * Extends the toolbar's and the section editor's, because the editor owns one
 * label bag and hands slices of it down rather than each level resolving its
 * own — a component that resolved its own would need the catalogue in the
 * browser.
 */
export interface FursonaEditorLabels
  extends EditorToolbarLabels, SectionEditorLabels {
  /** The theme panel's own strings, nested to avoid a `title` collision. */
  theme: ThemeConfiguratorLabels;
  /** Names the control that switches which language is being written. */
  writingIn: string;
  /** Says which fields the language switch governs. */
  writingInHint: string;
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
 * `initialSections` and `initialTheme` are **not optional in practice**, even
 * though the types allow their absence for the create page. `set_actor_sections`
 * replaces rather than merges, so an edit that opened without them deleted
 * everything the owner had written the moment they saved.
 *
 * `initialSections` is separate from `initial` because the two come from
 * different reads: the fields from `my_actors()`, the sections from
 * `actor_profiles`. `0009` deliberately did not join them.
 */
export interface FursonaEditorProps {
  /** Already-translated strings. */
  labels: FursonaEditorLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /** The fursona's existing sections, absent when creating. */
  initialSections?: FursonaSection[];
  /** How the page already looks, absent when creating. */
  initialTheme?: ActorTheme;
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
 * one whose limits are checked against `0009` by
 * `section-limits-match-migration.test.ts`.
 */
/** What the editor's form holds. */
type FursonaFormValues = z.infer<typeof editorSchema>;

const editorSchema = fursonaSchema.extend({
  sections: sectionsSchema,
  theme: themeSchema,
});

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
 *
 * Two error sources meet in one banner: what the schema rejected before
 * anything was sent, and what the database refused afterwards. Both are codes,
 * both look up in `labels.errors`, and the person does not need to know which
 * came from where.
 *
 * **The form no longer carries a scope class of its own.** It did, and that
 * class was what made the live preview visible at all after the preview shipped
 * scoped to a selector nothing in the tree wore — colours changed, the
 * stylesheet updated, and the page did not move. The colours then moved to
 * `:root`, which left the class matched by nothing; a skin needs a boundary
 * again, and that boundary is `SKIN_SCOPE` on `PageShell`'s content element,
 * which this form renders inside. A second copy here would be exactly the
 * drift the original fault was made of.
 *
 * **The theme panel sits above the sections**, because it governs how all of
 * them look, and it is collapsed until somebody opens it — theming is a thing
 * people do once and then leave alone, so an open colour panel would push the
 * sections down the page for everybody who never touches it. Its changes are
 * previewed locally and written with the rest of the form: what has to be
 * instant is SEEING a colour, not storing it.
 *
 * **The language switch shows both languages rather than the current one.** It
 * was a single button reading "EN", which is ambiguous in the way that matters:
 * a person cannot tell whether the label reports where they are or offers where
 * they could go. Both sides are on screen now, each naming itself in its own
 * language — an endonym is deliberately not translated, because a picker whose
 * options rename themselves is unreadable to whoever needs it — and the switch
 * sticks to the top, since it governs fields further down the page than it sits.
 *
 * Exposes the `editor-handle`, `editor-display-name`, `editor-visibility`,
 * `writing-in-en` and `writing-in-es`
 * test ids. They exist because a signed-in end-to-end test can reach this page
 * at last; the fields are addressed by test id rather than by label because a
 * label is translated and the suite runs in Spanish.
 *
 * @returns the editor.
 */
export function FursonaEditor({
  labels,
  initial,
  initialSections,
  initialTheme,
  actorRef,
  handleEditable,
}: FursonaEditorProps) {
  const router = useRouter();
  const { save, saving, fieldErrors } = useFursonaEditor(actorRef);
  const { lang, select } = useLanguageToggle();

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
      theme: initialTheme ?? DEFAULT_THEME,
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
                {...tid("editor-handle")}
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
            {...tid("editor-display-name")}
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
            {...tid("editor-visibility")}
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

      <div className="sticky top-2 z-10 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--edge)] bg-[var(--bar)]/95 p-3 backdrop-blur">
        <div className="grid gap-0.5">
          <span className="font-display text-sm font-bold">
            {labels.writingIn}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {labels.writingInHint}
          </span>
        </div>

        {/*
          Both languages are on screen and each names itself, so nothing has to
          be inferred from a single label. The endonyms are deliberately not
          translated: a language is called the same thing whatever interface
          you are reading, and "Spanish"/"Español" changing under somebody is
          how a language picker becomes unreadable to the person who needs it.
        */}
        <div
          role="group"
          aria-label={labels.writingIn}
          className="flex rounded-lg border border-[var(--edge)] p-0.5"
        >
          {(
            [
              ["en", "English"],
              ["es", "Español"],
            ] as const
          ).map(([value, name]) => (
            <button
              key={value}
              type="button"
              onClick={() => select(value)}
              aria-pressed={lang === value}
              {...tid(`writing-in-${value}`)}
              className={
                lang === value
                  ? "rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--on-accent)]"
                  : "rounded-md px-4 py-1.5 text-sm font-medium text-[var(--muted)]"
              }
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Above the sections, because it governs how all of them look. The
          panel is collapsed until somebody opens it — theming is a thing people
          do once and then leave alone, and an open colour panel would push the
          sections down the page for everybody who never touches it. */}
      <ThemeController control={control} labels={labels.theme} />

      <SectionEditor
        control={control}
        register={register}
        lang={lang}
        labels={labels}
      />
    </form>
  );
}

/**
 * The theme panel, bound to the form.
 *
 * A controller and not a `register`: the configurator hands back a whole theme
 * object on every change, which is not something a form input's `value` can
 * carry.
 *
 * @returns the panel.
 */
function ThemeController({
  control,
  labels,
}: {
  control: Control<FursonaFormValues>;
  labels: ThemeConfiguratorLabels;
}) {
  const field = useController({ control, name: "theme" });
  return (
    <ThemeConfigurator
      value={field.field.value as ActorTheme}
      onChange={field.field.onChange}
      labels={labels}
    />
  );
}
