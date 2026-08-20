/**
 * One shape offered in the section's shape control.
 *
 * `weights` absent is the even shape, and it is absent rather than a list of
 * ones so that picking "Even" stores what an unweighted section stores —
 * otherwise the same page would be two different rows depending on which
 * control had been touched.
 */
export interface SectionShape {
  /** Stable across a session; the message-key suffix and the React key. */
  id: string;
  /** How many places across the section lays. */
  spaces: number;
  /** One share per place, or absent for even. */
  weights?: number[];
}

/**
 * The shapes offered before anybody reaches for the per-place dials.
 *
 * **Every entry is a page somebody actually wants**, which is the same bar
 * `SECTION_PRESETS` sets itself. The dials underneath make anything else
 * reachable, so this list does not have to be complete — it has to be short
 * enough to read.
 */
export const SECTION_SHAPES: readonly SectionShape[] = [
  { id: "Even", spaces: 3 },
  { id: "WideMiddle", spaces: 3, weights: [1, 3, 1] },
  { id: "SidebarLeft", spaces: 2, weights: [1, 3] },
  { id: "SidebarRight", spaces: 2, weights: [3, 1] },
  { id: "WideLeft", spaces: 3, weights: [3, 1, 1] },
];
