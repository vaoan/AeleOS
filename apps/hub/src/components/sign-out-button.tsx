"use client";

import { useClerk } from "@clerk/nextjs";
import { tid } from "@/lib/test-id";

/** What the sign-out control needs from its caller. */
export interface SignOutControlProps {
  /** Visible label, from the message catalogue. */
  label: string;
  /**
   * Where to land afterwards.
   *
   * Passed in rather than derived here because only the server knows the
   * request's locale, and signing out of the Spanish app should not drop
   * somebody on the English home page.
   */
  redirectUrl: string;
}

/**
 * Signs the person out and returns them to the home page.
 *
 * A visible control rather than only the entry hidden inside Clerk's account
 * menu: signing out is something people look for, and hiding it behind an
 * avatar makes it a hunt.
 *
 * Uses `signOut({ redirectUrl })` rather than a bare `signOut()`. Without an
 * explicit destination Clerk decides where to land, which has already put this
 * app on a Clerk-branded address once — see the proxy's `unauthenticatedUrl`.
 *
 * @returns the sign-out button.
 */
export function SignOutControl({ label, redirectUrl }: SignOutControlProps) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      onClick={() => void signOut({ redirectUrl })}
      {...tid("sign-out")}
      className="rounded-lg border border-[var(--edge)] px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--edge)]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      {label}
    </button>
  );
}
