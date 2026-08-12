/**
 * Where the nebula preference is persisted.
 *
 * Distinct from the theme's key: the two settings are independent, and someone
 * who turns the clouds off has not asked for a different colour scheme.
 */
export const NEBULA_STORAGE_KEY = "aeleos-nebula";

/** Whether the nebula renders, and whether it moves. */
export interface NebulaState {
  /** Whether the cloud layer renders at all. */
  enabled: boolean;
  /** Whether it drifts. Always false when `enabled` is false. */
  animated: boolean;
}

/**
 * Decides whether the nebula renders and whether it moves.
 *
 * On by default. The nebula is the design rather than an embellishment, so
 * nobody should have to discover a setting to see the product as intended;
 * only an explicit "off" turns it away.
 *
 * Reduced motion stops the drift but keeps the layer. Someone asking for less
 * movement has not asked for a plainer product, and the static frame carries
 * the whole visual identity while costing no animation at all.
 *
 * `animated` is never true while `enabled` is false, so a caller can drive a
 * render loop from `animated` alone without re-checking.
 *
 * @param stored - the persisted choice, or null when there is none. Anything
 * other than "off" is treated as unset, so a stale value fails towards showing
 * the design rather than hiding it.
 * @param prefersReducedMotion - whether the system asks for reduced motion.
 * @returns whether to render the layer, and whether to animate it.
 */
export function resolveNebula(
  stored: string | null,
  prefersReducedMotion: boolean,
): NebulaState {
  const enabled = stored !== "off";
  return { enabled, animated: enabled && !prefersReducedMotion };
}
