"use client";

import { UserButton } from "@clerk/nextjs";
import { useClerkAppearance } from "@/features/session/presentation/use-clerk-appearance";

/**
 * Clerk's account menu, themed to the current mode.
 *
 * Split out for the same reason as the sign-in card: the appearance depends on
 * `data-theme`, which only exists in the browser.
 *
 * @returns the themed account menu.
 */
export function UserMenu() {
  return <UserButton appearance={useClerkAppearance()} />;
}
