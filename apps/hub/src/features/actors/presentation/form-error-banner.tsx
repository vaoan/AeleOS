"use client";

import { AlertTriangle } from "lucide-react";
import { tid } from "@/shared/infrastructure/test-id";
import { WidePageColumn } from "@/shared/presentation/page-shell";
import { CHROME_SCOPE } from "@/shared/domain/chrome";

/** Translated strings {@link FormErrorBanner} renders. */
export interface FormErrorBannerLabels {
  /** The banner's heading. */
  title: string;
  /** One message per error code the editor can produce. */
  errors: Record<string, string>;
}

/** What {@link FormErrorBanner} needs. */
export interface FormErrorBannerProps {
  /** Error codes keyed by field, plus the reserved `form` key. */
  errors: Record<string, string>;
  /** Already-translated strings. */
  labels: FormErrorBannerLabels;
}

/**
 * Everything wrong with the form, gathered above the fields.
 *
 * The editor is long enough to scroll a field's own message out of view, so
 * without this somebody presses Save, nothing appears to happen, and the reason
 * is four hundred pixels below them. The field messages stay where they are —
 * this is a summary, not a replacement.
 *
 * A code with no message is **skipped rather than rendered empty**: an
 * unexplained bullet is a problem nobody can act on, and a banner listing one
 * is worse than a banner that never appeared. If that leaves nothing to say,
 * nothing renders.
 *
 * **It owns its own page column, and that is what makes "nothing renders"
 * true (2026-09-03).** The editor used to wrap this in a `WidePageColumn`
 * carrying `pt-6 sm:pt-10`, so a form with nothing wrong still reserved 40px
 * of the author's backdrop above their first section — an empty band under
 * the toolbar, permanently, once the canvas became the scroller and it
 * stopped being able to scroll away. The column is inside the null check
 * now.
 *
 * The gate could not be lifted to the caller instead, because the rule above
 * is stricter than "there are errors": a code whose message is missing counts
 * as nothing to say. Asking `Object.keys(errors).length` at the call site is
 * a second answer to that question, and it is the wrong one for exactly the
 * case this component was careful about.
 *
 * The banner is a `surface`, so a refusal is drawn in the same form language as the fields that caused it.
 *
 * Every colour it paints comes from a token — `--accent`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Unchanged in behaviour; its class list moved to the canonical token spelling with everything else.
 *
 * **Exposes the `editor-error-banner` test id**, which `role="alert"` cannot
 * stand in for: the template picker's own confirmation is an alert too, so a
 * suite asserting that a save was NOT refused would be reading whichever of
 * the two happened to be on screen. The end-to-end suite that drives every
 * template through a real save needs to name this one — without it, a refused
 * save is only ever a navigation that never happened, which reports as a
 * timeout naming nothing.
 *
 * @returns the banner, or null when there is nothing to report.
 */
export function FormErrorBanner({ errors, labels }: FormErrorBannerProps) {
  const messages = Object.values(errors)
    .map((code) => labels.errors[code])
    .filter(Boolean);

  if (messages.length === 0) return null;

  return (
    // **A column meaning "no vertical padding above the top one" says
    // `py-0 sm:py-0` before its `pt-`.** `COLUMN.wide` is `py-6 sm:py-10`,
    // and tailwind-merge treats a responsive variant as its own group, so a
    // bare `py-0` overrides the base and leaves the `sm:` one standing.
    <WidePageColumn
      className={`${CHROME_SCOPE} flex-none py-0 pt-6 sm:py-0 sm:pt-10`}
    >
      <div
        role="alert"
        {...tid("editor-error-banner")}
        className="mb-6 rounded-xl surface border-(--accent)/50 bg-(--accent)/10 p-4"
      >
        <p className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangle className="size-4 text-(--accent)" />
          {labels.title}
        </p>
        <ul className="mt-2 grid gap-1 pl-6 text-sm text-(--muted)">
          {messages.map((message) => (
            <li key={message} className="list-disc">
              {message}
            </li>
          ))}
        </ul>
      </div>
    </WidePageColumn>
  );
}
