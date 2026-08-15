import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The real ActorTile, deliberately. Every other suite that renders a tile
// mocks this component — including both picker page tests, which hand-write
// their own submit button inside the mock. That means the field name and the
// value the button carries were asserted against a copy of the code rather
// than the code: renaming the field AND submitting the handle instead of the
// actorRef left all 239 tests green. This file is the only place the real
// button is looked at, which is why it exists even though actor-tile.tsx sits
// in an excluded coverage path and no gate will ask for it.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: "a",
}));

const { ActorTile } = await import("@/features/actors/presentation/actor-tile");

/**
 * An actor row as `listMyActors` returns it, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
function actor(over: Partial<Record<string, unknown>> = {}) {
  return {
    actorRef: "3f6b1c2e-0000-4000-8000-000000000001",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "private",
    status: "active",
    ...over,
  } as Parameters<typeof ActorTile>[0]["actor"];
}

/**
 * Renders one tile inside the list and form context it is designed for.
 *
 * @param props - the tile's props, minus the actor's fixed labels.
 * @returns the render result.
 */
function renderTile(props: Partial<Parameters<typeof ActorTile>[0]> = {}) {
  return render(
    <form>
      <ul>
        <ActorTile
          actor={actor()}
          youLabel="You"
          visibilityLabel="Private"
          {...props}
        />
      </ul>
    </form>,
  );
}

describe("ActorTile", () => {
  describe("with choose", () => {
    // The contract between this button and chooseActorAction. The action reads
    // formData.get("actor_ref") and resolves it against listMyActors(), so a
    // renamed field or a handle in place of the ref makes every choice fail as
    // "not yours" — safely, but silently, and in production only.
    it("submits the actor's ref under actor_ref", () => {
      const { container } = renderTile({
        choose: { label: "Continue as Sparky" },
      });

      const button = container.querySelector("button[type='submit']");
      expect(button).toHaveAttribute("name", "actor_ref");
      expect(button).toHaveAttribute(
        "value",
        "3f6b1c2e-0000-4000-8000-000000000001",
      );
    });

    // Asserted separately from the name: the reviewer showed that changing one
    // variable at a time can be masked by a test that checks the other.
    it("does not submit the handle in place of the ref", () => {
      const { container } = renderTile({
        choose: { label: "Continue as Sparky" },
      });

      expect(
        container.querySelector("button[type='submit']"),
      ).not.toHaveAttribute("value", "sparky");
    });

    it("renders the label as the button's accessible name", () => {
      renderTile({ choose: { label: "Continue as Sparky" } });

      expect(
        screen.getByRole("button", { name: "Continue as Sparky" }),
      ).toBeInTheDocument();
    });

    // A person row is as choosable as a fursona — "yourself" is the leading
    // tile in the picker, not a special case.
    it("offers the choice for a person row too", () => {
      const { container } = renderTile({
        actor: actor({ kind: "person", actorRef: "person-ref" }),
        choose: { label: "Continue as you" },
      });

      expect(container.querySelector("button[type='submit']")).toHaveAttribute(
        "value",
        "person-ref",
      );
    });
  });

  describe("without choose", () => {
    it("renders no submit button at all", () => {
      const { container } = renderTile();

      expect(container.querySelector("button")).toBeNull();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
    });

    it("still offers the edit link when it is given one", () => {
      renderTile({ edit: { href: "/pages/sparky/edit", label: "Edit" } });

      expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
        "href",
        "/pages/sparky/edit",
      );
    });

    it("offers no edit link to a person row", () => {
      renderTile({
        actor: actor({ kind: "person" }),
        edit: { href: "/pages/sparky/edit", label: "Edit" },
      });

      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });
});
