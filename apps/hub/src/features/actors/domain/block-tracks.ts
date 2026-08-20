import type { ContainerBlock } from "@/features/actors/domain/block-schema";

/**
 * The narrowest a weighted track may be laid, whatever its share works out to.
 *
 * **It is what makes a lopsided shape survive a small container.** At the
 * width where a three-place grid is first laid at all, a 1:6:1 split would
 * give its sides about 3.75rem — a sliver, because the container-query
 * thresholds were tuned for tracks that are all the same size. With a floor,
 * the sides take this and the middle takes the remainder, and as the container
 * grows the shares overtake the floor and the author's ratio asserts itself.
 *
 * **8rem is the largest value that fits inside every existing threshold**
 * with its gutters — 2 places need 17rem of the 20rem `@xs` allows, 6 need
 * 53rem of `@5xl`'s 64rem — and the headroom is spent on the section's own
 * padding, which the query does not measure. It is arithmetic rather than a
 * measurement, so `weighted-places.spec.ts` watches all five in a browser.
 */
export const TRACK_FLOOR = "8rem";

/**
 * The `grid-template-columns` a container's weights come to, or nothing.
 *
 * **Nothing is the common answer and it is not a failure.** It means "lay the
 * uniform tracks", which the caller reaches through a CSS `var()` fallback
 * rather than a branch — so a page with no weights emits exactly the CSS it
 * emitted before weights existed. Three separate cases resolve here: no
 * weights at all, a list whose length is not the container's `spaces`, and a
 * list whose shares are all equal.
 *
 * **The equal-share case is deliberate rather than an optimisation.** Uniform
 * weights and no weights are the same page, and answering the same thing for
 * both is what keeps the two from being distinguishable by a test that then
 * pins an accident.
 *
 * A width belongs to the place: this reads the container and never a child.
 *
 * @param container - the container whose places are being laid.
 * @returns the track list, or `undefined` to lay uniform tracks.
 */
export function trackListFor(container: ContainerBlock): string | undefined {
  const weights = container.weights;
  if (!weights || weights.length !== container.spaces) return undefined;
  if (weights.every((weight) => weight === weights[0])) return undefined;
  return weights
    .map((weight) => `minmax(min(${TRACK_FLOOR},100%),${weight}fr)`)
    .join(" ");
}
