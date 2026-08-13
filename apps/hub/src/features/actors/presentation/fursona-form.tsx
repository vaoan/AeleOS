"use client";

import { useActionState } from "react";
import {
  VISIBILITIES,
  type FursonaFormState,
  type FursonaInput,
  type Visibility,
} from "@/features/actors/domain/fursona-schema";

/** Translated strings {@link FursonaForm} renders. */
export interface FursonaFormLabels {
  handle: string;
  handleHint: string;
  displayName: string;
  avatarUrl: string;
  visibilityLabel: string;
  submit: string;
  visibility: Record<Visibility, string>;
  errors: Record<string, string>;
}

/** What {@link FursonaForm} needs to render and submit. */
export interface FursonaFormProps {
  /** The server action to submit to. */
  action: (
    state: FursonaFormState,
    formData: FormData,
  ) => Promise<FursonaFormState>;
  /** Already-translated labels and error messages. */
  labels: FursonaFormLabels;
  /** Existing values when editing; absent when creating. */
  initial?: Partial<FursonaInput>;
  /** False when editing — the handle is then shown but not submitted. */
  handleEditable: boolean;
  /** The fursona being edited, sent back so the action knows which row. */
  actorRef?: string;
}

/**
 * The create and edit form for a fursona.
 *
 * Takes translated strings as props rather than calling a translation hook: it
 * is a client component, and passing the strings in keeps the catalogue lookup
 * on the server where the locale already is.
 *
 * Error messages are looked up from `labels.errors` by the **code** the server
 * action returns, so the wording lives in the catalogues and the action stays
 * locale-free.
 *
 * Every field renders its error the same way: an accent-coloured `role="alert"`
 * span beneath the control, announced when it appears. The handle's error is
 * additional to its hint rather than a replacement for it — see the comment at
 * that field for why it was the one exception and why it no longer is.
 *
 * `form` is a **reserved key** in `state.errors`, not a field name: it renders
 * as a single form-level alert above the submit button, for a refusal nothing
 * the person typed can fix — the fursona quota being the only one today. No
 * input may be given `name="form"`, or its error would move there.
 *
 * @returns the form.
 */
export function FursonaForm({
  action,
  labels,
  initial,
  handleEditable,
  actorRef,
}: FursonaFormProps) {
  const [state, formAction, pending] = useActionState(action, { errors: {} });

  /**
   * The error message for a field, if it has one.
   *
   * @param field - the field name.
   * @returns the translated message, or undefined.
   */
  const errorFor = (field: string): string | undefined => {
    const code = state.errors[field];
    if (!code) return undefined;
    // Codes the action invents (handleTaken) and codes zod produces both land
    // here; fall back to the field's generic message for the latter.
    return labels.errors[code] ?? labels.errors[field];
  };

  return (
    <form action={formAction} className="mt-8 grid gap-6">
      {actorRef ? (
        <input type="hidden" name="actorRef" value={actorRef} />
      ) : null}

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.handle}</span>
        {handleEditable ? (
          <input
            name="handle"
            defaultValue={initial?.handle ?? ""}
            required
            maxLength={32}
            aria-invalid={Boolean(errorFor("handle"))}
            aria-describedby={
              errorFor("handle") ? "handle-hint handle-error" : "handle-hint"
            }
            className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
          />
        ) : (
          // Read-only text, not a disabled input: a disabled input submits
          // nothing, and the update action does not want the handle anyway.
          <span className="px-3 py-2 font-mono text-sm text-[var(--muted)]">
            @{initial?.handle}
          </span>
        )}
        {/* The hint stays put and the error joins it, rather than replacing
            it. The handle's error was the one field whose message rendered in
            the muted hint colour — so "That handle is already taken.", the
            message this form produces more than any other, arrived styled as
            guidance. It gets the same accent as the other three fields, and
            the hint keeps saying what a valid handle looks like while the
            person fixes it. */}
        <span id="handle-hint" className="text-xs text-[var(--muted)]">
          {labels.handleHint}
        </span>
        {errorFor("handle") ? (
          <span
            id="handle-error"
            role="alert"
            className="text-xs text-[var(--accent)]"
          >
            {errorFor("handle")}
          </span>
        ) : null}
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.displayName}</span>
        <input
          name="displayName"
          defaultValue={initial?.displayName ?? ""}
          maxLength={64}
          aria-invalid={Boolean(errorFor("displayName"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        />
        {errorFor("displayName") ? (
          <span role="alert" className="text-xs text-[var(--accent)]">
            {errorFor("displayName")}
          </span>
        ) : null}
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.avatarUrl}</span>
        <input
          name="avatarUrl"
          type="url"
          defaultValue={initial?.avatarUrl ?? ""}
          aria-invalid={Boolean(errorFor("avatarUrl"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        />
        {errorFor("avatarUrl") ? (
          <span role="alert" className="text-xs text-[var(--accent)]">
            {errorFor("avatarUrl")}
          </span>
        ) : null}
      </label>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{labels.visibilityLabel}</span>
        <select
          name="visibility"
          defaultValue={initial?.visibility ?? "private"}
          aria-invalid={Boolean(errorFor("visibility"))}
          className="rounded-lg border border-[var(--edge)]/60 bg-transparent px-3 py-2"
        >
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>
              {labels.visibility[v]}
            </option>
          ))}
        </select>
        {errorFor("visibility") ? (
          <span role="alert" className="text-xs text-[var(--accent)]">
            {errorFor("visibility")}
          </span>
        ) : null}
      </label>

      {/* Form-level, not field-level. `form` is a reserved key in the error
          map — no input carries that name — and it is how the action reports a
          failure nothing the person typed can fix, the fursona quota being the
          only one today. It sits above the submit button rather than under a
          field because that is where the person is looking when it appears. */}
      {errorFor("form") ? (
        <span role="alert" className="text-sm text-[var(--accent)]">
          {errorFor("form")}
        </span>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
      >
        {labels.submit}
      </button>
    </form>
  );
}
