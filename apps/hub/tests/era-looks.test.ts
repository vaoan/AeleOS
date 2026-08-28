import { describe, expect, it } from "vitest";

import { ERA_LOOKS } from "@/features/actors/domain/era-looks";
import {
  parseDocument,
  toDocument,
} from "@/features/actors/domain/page-document";
import {
  fitsActorKind,
  missingRequiredKinds,
} from "@/features/actors/domain/required-blocks";
import { SKINS } from "@/shared/domain/skins";

// WHAT A LOOK HAS TO SURVIVE.
//
// A look is a document somebody pastes as well as a template somebody picks,
// so it meets two different refusals and both are checked here rather than
// discovered by whoever tries one. `parseDocument` is the paste path;
// `missingRequiredKinds` is what `set_actor_sections` refuses a save for.

describe("ERA_LOOKS", () => {
  it("ships the five eras, oldest first", () => {
    // **Anti-vacuity, and it names the order.** Every case below iterates, so
    // an empty list would satisfy all of them for free — and the ordering is
    // part of the contract rather than incidental, since it is what an author
    // meets in the picker.
    expect(ERA_LOOKS.map((one) => one.id)).toEqual([
      "era-win98",
      "era-winxp",
      "era-vista",
      "era-win7",
      "era-win8",
    ]);
  });

  it("ships documents a fursona's own parser accepts", () => {
    for (const look of ERA_LOOKS) {
      const parsed = parseDocument(
        toDocument(look.theme!, [...look.blocks]),
        "fursona",
      );
      // Named, so a failure says WHICH look rather than that one of five is
      // wrong.
      expect(parsed.ok, `${look.id} parses`).toBe(true);
    }
  });

  // **A look is a FURSONA document, and a person's page refuses it.** Not an
  // oversight: a look names `owner`, which has nothing to render on somebody's
  // own profile, so `set_actor_sections` refuses the save outright. Asserting
  // the refusal rather than working around it is what makes the picker's
  // filter — `fitsActorKind` — a stated rule instead of a quiet omission.
  //
  // This is the case that found the defect. Without it the looks would have
  // shipped offerable on `/me/edit`, applying cleanly and failing at Save.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s fits a fursona's page and not a person's",
    (_id, look) => {
      expect(fitsActorKind([...look.blocks], "fursona")).toBe(true);
      expect(fitsActorKind([...look.blocks], "person")).toBe(false);
    },
  );

  // **The save refuses a page naming no identity, and a paste never runs the
  // read path that would add one.** So a look has to carry its own, and this
  // is the case that catches one that does not — `parseDocument` above would
  // happily accept it, because that is a different refusal.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s carries every kind a fursona's page must have",
    (_id, look) => {
      expect(missingRequiredKinds([...look.blocks], "fursona")).toEqual([]);
    },
  );

  // **The whole point of a look**, and what separates one from a starter: a
  // starter is structure and carries `theme: null`, a look is mostly theme.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s carries a theme",
    (_id, look) => {
      expect(look.theme).not.toBeNull();
    },
  );

  // **No new skin was added for any of them**, which is the finding that
  // shaped the phase. `retro` already is Windows 98's bevel and `aero` already
  // is Aero glass; a look that named a skin of its own would mean somebody had
  // added one, and this is what would tell them to argue for it first.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s names a skin that already existed",
    (_id, look) => {
      expect(SKINS as readonly string[]).toContain(look.theme!.skin);
    },
  );

  // Vista and Windows 7 differ by PALETTE and not by mechanism — both are
  // `aero`. That is a refinement of the spec, which called them near-identical,
  // and it is the clearest evidence in the phase that a look is a document
  // rather than a skin. Asserting the shared skin AND the differing background
  // is the pair: either alone is true of things that are not this.
  it("gives Vista and Windows 7 one skin and two palettes", () => {
    const vista = ERA_LOOKS.find((one) => one.id === "era-vista")!;
    const win7 = ERA_LOOKS.find((one) => one.id === "era-win7")!;

    expect(vista.theme!.skin).toBe(win7.theme!.skin);
    expect(vista.theme!.background).not.toEqual(win7.theme!.background);
  });

  // **Every look sets an ACCENT, and a browser test depends on it.**
  // `editor-saves-page.spec.ts` predicts the colour after applying a template
  // as `template.theme?.accent ?? CHOSEN_ACCENT` — one unconditional
  // assertion rather than a branch. A look that left its accent null would
  // make that formula silently expect the author's own colour and pass
  // whatever the look did, which is the vacuous shape this repository keeps
  // paying for.
  it.each(ERA_LOOKS.map((one) => [one.id, one] as const))(
    "%s sets an accent of its own",
    (_id, look) => {
      expect(look.theme!.accent).toBeTruthy();
    },
  );

  // Every id is prefixed, because `fursona-templates.ts` tells a starter from
  // a look by that prefix when it asserts starters carry no theme.
  it.each(ERA_LOOKS.map((one) => [one.id] as const))(
    "%s is prefixed so a starter can be told from a look",
    (id) => {
      expect(id.startsWith("era-")).toBe(true);
    },
  );
});
