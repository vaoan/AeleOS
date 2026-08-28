"use client";

import { LayoutTemplate } from "lucide-react";
import { tid } from "@/shared/infrastructure/test-id";
import { useState } from "react";
import {
  FURSONA_TEMPLATES,
  type ChosenPage,
  type FursonaTemplate,
} from "@/features/actors/domain/fursona-templates";

/**
 * Translated strings {@link TemplatePicker} renders.
 *
 * The three records are keyed by template id, and the caller is expected to
 * build them by mapping `FURSONA_TEMPLATES` rather than listing them by hand —
 * a template added later would otherwise show a raw catalogue key at somebody.
 */
export interface TemplatePickerLabels {
  /** Names the control that opens the list. */
  useTemplate: string;
  /** Warns that applying one replaces what is there. */
  templateConfirm: string;
  /**
   * Goes ahead with the replacement.
   *
   * Named for the confirmation rather than called `confirm`, because the
   * editor's toolbar already owns a `cancel` meaning "stop editing" and the two
   * meet in one label bag. A shared key there would put the wrong word on one
   * of the two buttons.
   */
  templateConfirmYes: string;
  /** Backs out of it. */
  templateConfirmNo: string;
  /** One name per template, keyed by id. */
  names: Record<string, string>;
  /** One description per template, keyed by id. */
  descriptions: Record<string, string>;
  /** How many sections each brings, already pluralised, keyed by id. */
  sectionCounts: Record<string, string>;
}

/**
 * What {@link TemplatePicker} needs.
 *
 * `onApply` hands over a whole {@link ChosenPage} — the page AND the look —
 * where it used to hand over sections alone. That is what makes a look
 * pickable at all: chrome, palette, heading and spacing are not structure, so
 * a template that could only carry structure could never express one.
 */
export interface TemplatePickerProps {
  /** Whether there is anything a template would replace. */
  hasSections: boolean;
  /** Already-translated strings. */
  labels: TemplatePickerLabels;
  /**
   * Called with a fresh copy of the chosen template's page AND its look.
   *
   * **It hands out both, and that is what makes an era look pickable.** A
   * template used to be sections alone, which could never express a look —
   * chrome, palette, heading and spacing are not structure. `theme` is null for
   * every shipped starter and means "leave the author's colours alone"; a
   * caller must not write a null through, or applying a starter would reset
   * somebody's palette.
   */
  onApply: (chosen: ChosenPage) => void;
}

/**
 * Starts a fursona's page from one of the shipped layouts.
 *
 * **It offers a page and a look together.** A template carries a `theme` now,
 * null for every shipped starter, and null means leave the author's colours
 * alone — so picking a starter is exactly as non-destructive to a palette as
 * it always was, while an era look can replace one deliberately.
 *
 * **Applying replaces, and replacing is confirmed inline.** Appending a
 * template onto existing sections would produce a page nobody asked for, so it
 * replaces — which makes it destructive, which makes it a two-click action. The
 * confirmation is inline rather than `globalThis.confirm`, matching the delete
 * control in the fursona list: a browser dialogue is not ours to style, to
 * translate, or to test.
 *
 * With nothing to lose there is nothing to confirm, and the first click applies.
 *
 * **What the caller receives is always a copy.** `FURSONA_TEMPLATES` is a
 * module-level constant, so a reference handed into `useFieldArray` would be
 * rewritten by the first person who edited what it inserted — for everybody
 * else in the session. `template-picker.test.tsx` is the only place that can
 * catch that.
 *
 * The template's own words come from `labels`, resolved on the server from the
 * catalogue. The sections it inserts do not: those become the person's writing
 * the moment they arrive.
 *
 * The two confirmation words are `templateConfirmYes` and `templateConfirmNo`
 * rather than `confirm` and `cancel`, because this component's labels are
 * merged into the editor's one bag, where `cancel` already means "stop
 * editing". Sharing that key would put the wrong word on one of two buttons.
 *
 * Exposes `template-picker` and `template-<id>` test ids, so the end-to-end
 * suite can build a page out of real sections without typing one field at a
 * time — a template is the shortest honest path from an empty editor to
 * something a stranger can read.
 *
 * The trigger and each template's card are `surface`s, the class skins style.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--muted`, `--on-accent` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the picker.
 */
export function TemplatePicker({
  hasSections,
  labels,
  onApply,
}: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FursonaTemplate | undefined>();

  /**
   * Hands out a fresh copy and closes everything.
   *
   * @param template - the template to apply.
   */
  const apply = (template: FursonaTemplate): void => {
    // **Cloned, and the clone is the whole reason this is a function.** The
    // shipped list is frozen shallowly and its contents are not, so a reference
    // handed straight into the form would let one person's edits rewrite the
    // constant for the rest of the session.
    onApply({
      blocks: structuredClone(template.blocks),
      theme: structuredClone(template.theme),
    });
    setPending(undefined);
    setOpen(false);
  };

  /**
   * Applies at once, or asks first when there is something to replace.
   *
   * @param template - the template that was chosen.
   */
  const choose = (template: FursonaTemplate): void => {
    if (hasSections) {
      setPending(template);
      return;
    }
    apply(template);
  };

  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        {...tid("template-picker")}
        onClick={() => {
          setOpen((was) => !was);
          setPending(undefined);
        }}
        className="flex w-fit items-center gap-1.5 rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
      >
        <LayoutTemplate className="size-4" />
        {labels.useTemplate}
      </button>

      {open ? (
        <div className="grid gap-1 rounded-xl surface border-(--edge) bg-(--surface) p-2">
          {FURSONA_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              aria-label={labels.names[template.id]}
              {...tid(`template-${template.id}`)}
              onClick={() => choose(template)}
              className="grid gap-0.5 rounded-lg px-3 py-2 text-left"
            >
              <span className="font-display text-sm font-bold">
                {labels.names[template.id]}
              </span>
              <span className="text-xs text-(--muted)">
                {labels.descriptions[template.id]}
              </span>
              <span className="text-xs text-(--muted)">
                {labels.sectionCounts[template.id]}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {pending ? (
        <div
          role="alert"
          className="grid gap-2 rounded-xl surface border-(--edge) bg-(--surface) p-3"
        >
          <p className="text-sm">{labels.templateConfirm}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => apply(pending)}
              className="rounded-lg bg-(--accent) px-3 py-1.5 text-sm text-(--on-accent)"
            >
              {labels.templateConfirmYes}
            </button>
            <button
              type="button"
              onClick={() => setPending(undefined)}
              className="rounded-lg surface border-(--edge)/60 px-3 py-1.5 text-sm"
            >
              {labels.templateConfirmNo}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
