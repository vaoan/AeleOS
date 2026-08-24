"use client";

import { useTranslations } from "next-intl";
import { Card, WidePageColumn } from "@/shared/presentation/page-shell";
import { tid } from "@/shared/infrastructure/test-id";

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
 * It is rendered through an interpolated message rather than concatenated with
 * a literal separator, because where the colon sits is a property of the
 * language. The `error-digest` test id is what the suite selects.
 *
 * Its panel carries `surface`, the class skins style — not Tailwind's `border`, which reaches nothing.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--muted` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * Its retry button's focus ring names a width and a colour but **no offset**,
 * so it takes the inset one `@utility surface` sets. Naming an offset here
 * would win on specificity and leave this one control ringed outside its edge
 * while every other surface in the app is ringed inside.
 *
 * It owns the same {@link WidePageColumn} as the routes it replaces, so a
 * render failure does not also move the recovery surface.
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
    <WidePageColumn>
      <Card>
        <section role="alert" className="flex flex-col items-start gap-4">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-(--ink-2)">{t("body")}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg surface border-(--edge) px-4 py-2 text-sm transition-colors hover:bg-(--edge)/15 focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            {t("retry")}
          </button>
          {error.digest ? (
            <p
              className="font-mono text-xs text-(--muted)"
              {...tid("error-digest")}
            >
              {/* The separator is part of the message, not the markup: where the
                colon goes is a property of the language. */}
              {t("reference", { digest: error.digest })}
            </p>
          ) : null}
        </section>
      </Card>
    </WidePageColumn>
  );
}
