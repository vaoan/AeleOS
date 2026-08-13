import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, with later Tailwind utilities beating earlier ones.
 *
 * Two layers, and both are load-bearing. `clsx` flattens conditionals so a
 * caller can inline `cond && "..."`; `tailwind-merge` then resolves conflicts,
 * so a component's default `px-2` loses to a caller's `px-4` instead of both
 * landing in the attribute and the winner being decided by CSS order.
 *
 * This is the one thing the studio port needs from Libra's `ui` package. It is
 * reimplemented rather than vendored because the rest of that package is the
 * theme, which AeleOS deliberately does not take.
 *
 * @param inputs - class names, arrays, or conditional expressions.
 * @returns the merged class attribute.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
