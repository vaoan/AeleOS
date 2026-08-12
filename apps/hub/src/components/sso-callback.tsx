"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

/** Where the callback sends people once a session exists. */
export interface SsoCallbackProps {
  /** Locale-prefixed path to land on after signing in. */
  afterSignInUrl: string;
}

/**
 * Completes the provider redirect.
 *
 * The one piece of Clerk's own UI kept, because it renders nothing: it reads
 * the parameters the provider sent back, exchanges them for a session and then
 * navigates. There is no markup to own here, only a handshake.
 *
 * @returns the callback handler.
 */
export function SsoCallback({ afterSignInUrl }: SsoCallbackProps) {
  return (
    <AuthenticateWithRedirectCallback
      signInFallbackRedirectUrl={afterSignInUrl}
      signUpFallbackRedirectUrl={afterSignInUrl}
    />
  );
}
