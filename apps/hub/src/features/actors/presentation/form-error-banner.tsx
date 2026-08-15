"use client";

import { AlertTriangle } from "lucide-react";

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
 * The banner is a `surface`, so a refusal is drawn in the same form language as the fields that caused it.
 *
 * @returns the banner, or null when there is nothing to report.
 */
export function FormErrorBanner({ errors, labels }: FormErrorBannerProps) {
  const messages = Object.values(errors)
    .map((code) => labels.errors[code])
    .filter((message): message is string => Boolean(message));

  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      className="mb-6 rounded-xl surface border-[var(--accent)]/50 bg-[var(--accent)]/10 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 text-[var(--accent)]" />
        {labels.title}
      </p>
      <ul className="mt-2 grid gap-1 pl-6 text-sm text-[var(--muted)]">
        {messages.map((message) => (
          <li key={message} className="list-disc">
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
