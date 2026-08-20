import type { PageContext } from "@/features/actors/presentation/blocks";

/**
 * A {@link PageContext} for a test that does not care about one.
 *
 * **A factory rather than a shared constant**, so a test that mutates what it
 * is given cannot reach into another test's fixture. Every field has a value
 * that is obviously a fixture, because a test asserting on "Luna" should fail
 * loudly if it is really reading this.
 *
 * **It defaults to a FURSONA's page**, which is the shape with an owner and no
 * fursona list. A test about a person's page passes `actorKind: "person"` and
 * `fursonas`, and must also clear `owner` — the two are mutually exclusive and
 * nothing here enforces that, because a fixture that silently corrected an
 * impossible combination would hide the case where production produced one.
 *
 * @param over - fields to replace.
 *
 * Its `measure` is null, the design's own, so a case that does not care about
 * the width gets the layout every page already had.
 *
 * @returns the context.
 */
export function pageContext(over: Partial<PageContext> = {}): PageContext {
  return {
    parentHost: "",
    actorKind: "fursona",
    handle: "fixture-handle",
    address: "fixture-address",
    displayName: "Fixture Name",
    avatarUrl: null,
    owner: {
      address: "fixture-owner",
      displayName: "Fixture Owner",
      avatarUrl: null,
    },
    measure: null,
    fursonasFallbackTitle: "Fixture fursonas",
    ...over,
  };
}
