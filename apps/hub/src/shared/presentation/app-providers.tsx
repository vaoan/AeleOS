"use client";

import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { QueryProvider } from "@/shared/presentation/query-provider";

/** What {@link AppProviders} wraps. */
export interface AppProvidersProps {
  /** The tree that may use query hooks or URL state. */
  children: ReactNode;
}

/**
 * Every client provider the app needs, in one place.
 *
 * One component rather than two in the layout, because these arrived at
 * different times and the second was forgotten. `nuqs` shipped in phase 2b
 * without its adapter, so `/fursonas` threw "nuqs requires an adapter to work
 * with your framework" on render, and the signed-in error boundary reported
 * that to somebody as "we could not load your identity". Nothing caught it:
 * every unit test stubs `nuqs`, which is precisely what made a missing adapter
 * invisible.
 *
 * **A provider a hook depends on belongs here**, so that adding the hook and
 * forgetting the provider is one edit rather than two. `app-providers.test.tsx`
 * exercises the real `nuqs` against the real adapter and is the only test in
 * the suite that does.
 *
 * `NuqsAdapter` is outermost so the query client is inside it; neither depends
 * on the other, and this order keeps URL state available to anything the query
 * layer renders.
 *
 * @returns the provided tree.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <NuqsAdapter>
      <QueryProvider>{children}</QueryProvider>
    </NuqsAdapter>
  );
}
