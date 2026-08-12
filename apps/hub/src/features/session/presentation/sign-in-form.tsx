"use client";

import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import {
  DiscordMark,
  FacebookMark,
  GoogleMark,
} from "@/features/session/presentation/provider-marks";
import {
  PROVIDERS,
  type Provider,
} from "@/features/session/infrastructure/providers";
import { tid } from "@/shared/infrastructure/test-id";

/** Brand mark per provider, so the list stays data and the marks stay markup. */
const MARKS: Record<Provider["id"], () => React.JSX.Element> = {
  discord: DiscordMark,
  google: GoogleMark,
  facebook: FacebookMark,
};

/** What the form needs from the server, which is the only place that knows it. */
export interface SignInFormProps {
  /**
   * Where Clerk returns to after the provider redirect, absolute path.
   * Locale-prefixed, so a Spanish visitor comes back to the Spanish app.
   */
  callbackUrl: string;
  /** Where to land once the session exists. */
  afterSignInUrl: string;
  /** Localised "Continue with …", already interpolated per provider. */
  labels: Record<Provider["id"], string>;
  /** Localised message shown when starting a provider redirect fails. */
  errorLabel: string;
}

/**
 * The sign-in page's provider buttons.
 *
 * **This is our markup, not Clerk's `<SignIn />`.** That component renders its
 * own DOM, which could only be shaped by `!important` overrides, and it insists
 * on surfaces this product does not have: an email field, a password path and a
 * "sign up" link. AeleOS is social-login-first with no passwords, so the whole
 * of sign-in is these buttons — building them is less code than fighting for
 * control of somebody else's.
 *
 * Clerk still performs the authentication. Only the interface is ours.
 *
 * Uses this Clerk version's signal API: `signIn.sso()`, which **returns** an
 * error rather than throwing one. A try/catch alone would treat a failed
 * hand-off as a success and leave somebody staring at an unchanged page, so the
 * returned error is checked as well as the thrown one.
 *
 * @returns the provider buttons.
 */
export function SignInForm({
  callbackUrl,
  afterSignInUrl,
  labels,
  errorLabel,
}: SignInFormProps) {
  const { signIn, fetchStatus } = useSignIn();
  const [pending, setPending] = useState<Provider["id"] | null>(null);
  const [failed, setFailed] = useState(false);
  const busy = pending !== null || fetchStatus === "fetching";

  /**
   * Hands off to a provider.
   *
   * @param provider - the provider whose button was pressed.
   * @returns nothing; the page navigates away on success.
   */
  const start = async (provider: Provider) => {
    if (!signIn) return;
    setPending(provider.id);
    setFailed(false);
    try {
      const { error } = await signIn.sso({
        strategy: provider.strategy,
        redirectUrl: afterSignInUrl,
        redirectCallbackUrl: callbackUrl,
      });
      if (!error) return;
    } catch {
      // Fall through: a thrown fault and a returned error mean the same thing
      // to the person looking at the page.
    }
    // The redirect never happened, so this page is still on screen and has to
    // say so. Clerk's own detail is not shown: it names strategies and instance
    // configuration, none of which helps whoever is reading it.
    setPending(null);
    setFailed(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {PROVIDERS.map((provider) => {
        const Mark = MARKS[provider.id];
        return (
          <button
            key={provider.id}
            type="button"
            disabled={busy}
            onClick={() => void start(provider)}
            {...tid(`sign-in-${provider.id}`)}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[var(--edge)] bg-[var(--bar)] font-medium transition-colors hover:bg-[var(--edge)]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60"
          >
            <Mark />
            <span>{labels[provider.id]}</span>
          </button>
        );
      })}
      {failed ? (
        <p
          role="alert"
          {...tid("sign-in-error")}
          className="text-sm text-[var(--accent)]"
        >
          {errorLabel}
        </p>
      ) : null}
    </div>
  );
}
