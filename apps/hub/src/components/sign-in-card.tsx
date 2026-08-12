"use client";

import { SignIn } from "@clerk/nextjs";
import { useClerkAppearance } from "@/components/use-clerk-appearance";

/**
 * Clerk's sign-in form, themed to the current mode.
 *
 * A client component only because the appearance depends on `data-theme`,
 * which exists only in the browser. The surrounding page, its heading and its
 * card all stay on the server.
 *
 * @returns the themed sign-in form.
 */
export function SignInCard() {
  return <SignIn appearance={useClerkAppearance()} />;
}
