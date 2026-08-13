"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/** What {@link QueryProvider} wraps. */
export interface QueryProviderProps {
  /** The tree that may use query hooks. */
  children: ReactNode;
}

/**
 * Owns the React Query client for the whole app.
 *
 * The client is created in `useState`'s initialiser rather than in the render
 * body or at module scope, and both alternatives are wrong for different
 * reasons. In the render body it would be rebuilt on every render, discarding
 * every cached query — a fault that shows up as a cache that never hits rather
 * than as an error. At module scope it would be shared across requests on the
 * server, where one visitor's cached data would be handed to the next.
 *
 * @returns the provider.
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
