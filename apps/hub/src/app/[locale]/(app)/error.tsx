"use client";

import { useTranslations } from "next-intl";
import { Card } from "@/components/page-shell";

/**
 * Failure boundary for every signed-in page.
 *
 * /me provisions and reads the actor registry while rendering, so a database
 * outage or an RLS denial surfaces here. It must say so plainly: the failure
 * mode this replaces rendered a page that looked like an identity with no
 * details in it, which reads as "you have no fursonas" rather than "we could
 * not reach the database".
 *
 * The raw message is deliberately not shown — it can carry view, policy and
 * connection details. The digest is what support needs to find the server log.
 *
 * @returns the failure panel.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("error");

  return (
    <Card>
      <section role="alert" className="flex flex-col items-start gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm text-[var(--ink-2)]">{t("body")}</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--edge)] px-4 py-2 text-sm transition-colors hover:bg-[var(--edge)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          {t("retry")}
        </button>
        {error.digest ? (
          <p className="font-mono text-xs text-[var(--muted)]">
            {t("reference")}: {error.digest}
          </p>
        ) : null}
      </section>
    </Card>
  );
}
