"use client";

import { Check, X } from "lucide-react";

/** Translated strings {@link EditorToolbar} renders. */
export interface EditorToolbarLabels {
  /** The save button when idle. */
  save: string;
  /** The save button while a save is in flight. */
  saving: string;
  /** Leaves without saving. */
  cancel: string;
}

/** What {@link EditorToolbar} needs. */
export interface EditorToolbarProps {
  /** What is being edited, shown on the left. */
  title: string;
  /** Already-translated strings. */
  labels: EditorToolbarLabels;
  /** True while a save is in flight. */
  saving: boolean;
  /** Called when somebody leaves without saving. */
  onCancel: () => void;
}

/**
 * The editor's sticky bar: what you are editing, and the two ways out.
 *
 * Sticky because the editor is long and Save must not scroll away — that is
 * the studio's arrangement and the reason for it.
 *
 * **Save is a submit button, not a click handler.** The form owns submission,
 * so pressing Enter in a text field saves exactly as pressing Save does, and
 * there is one path to guard rather than two.
 *
 * It is disabled while saving, which prevents a double submit. Without it the
 * second one reaches `create_fursona` and comes back "handle already yours" —
 * a baffling error about a fursona that was just created successfully.
 *
 * @returns the toolbar.
 */
export function EditorToolbar({
  title,
  labels,
  saving,
  onCancel,
}: EditorToolbarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-[var(--edge)]/40 bg-[var(--bar)] px-6 py-3 backdrop-blur-md">
      <span className="font-display text-lg font-bold tracking-tight">
        {title}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-[var(--muted)]"
        >
          <X className="size-4" />
          {labels.cancel}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
        >
          <Check className="size-4" />
          {saving ? labels.saving : labels.save}
        </button>
      </span>
    </div>
  );
}
