"use client";

import { useParams } from "next/navigation";
import {
  usePathname,
  useRouter,
} from "@/shared/infrastructure/i18n/navigation";
import { routing } from "@/shared/infrastructure/i18n/routing";
import { tid } from "@/shared/infrastructure/test-id";

/** What the control needs from its caller. */
export interface LanguageToggleProps {
  /** Accessible name, e.g. "Change language". */
  label: string;
}

/**
 * Switches between the supported languages.
 *
 * Uses next-intl's own `usePathname` and `useRouter` rather than Next's: the
 * plain ones return the locale-prefixed path, so switching would append a
 * second prefix and land on `/en/es/me`. These are locale-aware and put you on
 * the same page in the other language rather than back at the home page, which
 * is the thing that makes a language switch feel broken.
 *
 * Shows the language it will switch *to*, not the current one — a control
 * should say what it does.
 *
 * `replace` rather than `push`, so the back button does not walk through every
 * language the visitor tried.
 *
 * Every colour it paints comes from a token — `--accent`, `--edge`, `--ink` — and never from a literal. That is what lets a person's theme reach it at all.
 *
 * @returns the language control.
 */
export function LanguageToggle({ label }: LanguageToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const current =
    typeof params.locale === "string" ? params.locale : routing.defaultLocale;
  const next =
    routing.locales.find((locale) => locale !== current) ??
    routing.defaultLocale;

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      aria-label={label}
      {...tid("language-toggle")}
      className="grid h-[30px] min-w-[34px] place-items-center rounded-full px-2 font-mono text-xs font-medium text-(--ink-2) uppercase transition-colors hover:bg-(--edge)/20 hover:text-(--ink) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
    >
      {next}
    </button>
  );
}
