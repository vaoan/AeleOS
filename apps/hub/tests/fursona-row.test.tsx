import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

// Forwards every prop, as the real Link does. An earlier version passed only
// href and children, which silently dropped `aria-label` — so an icon link had
// no accessible name in the test and none of the role queries could find it.
vi.mock("@/shared/infrastructure/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { FursonaRow } =
  await import("@/features/actors/presentation/fursona-row");

const labels = {
  you: "You",
  edit: "Edit",
  pin: "Pin",
  unpin: "Unpin",
  remove: "Delete",
  confirm: "Confirm",
  cancel: "Cancel",
  dragToReorder: "Drag to reorder",
  viewPublic: "See the public page",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
};

/**
 * An actor row, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
const actor = (over: Record<string, unknown> = {}) =>
  ({
    actorRef: "ref-1",
    kind: "fursona",
    handle: "sparky",
    displayName: "Sparky",
    avatarUrl: null,
    visibility: "public",
    status: "active",
    ...over,
  }) as never;

/**
 * Renders a row with the given overrides and spies.
 *
 * @param props - what to override on the row.
 * @returns the spies, so a test can assert on them.
 */
function renderRow(props: Record<string, unknown> = {}) {
  const onPin = vi.fn();
  const onDelete = vi.fn();
  render(
    <FursonaRow
      actor={actor()}
      labels={labels}
      featured={false}
      canArrange
      // Nothing sortable wraps this render, so there is no grip to hand
      // down — which is also what a row that may not be arranged gets.
      drag={null}
      onPin={onPin}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onPin, onDelete };
}

/**
 * Clicks a button by its accessible name.
 *
 * @param name - the button's name.
 */
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("FursonaRow", () => {
  it("shows the display name and the handle", () => {
    renderRow();
    expect(screen.getByText("Sparky")).toBeInTheDocument();
    expect(screen.getByText("@sparky")).toBeInTheDocument();
  });

  it("shows the visibility in the reader's language", () => {
    renderRow();
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("links to the edit page by handle", () => {
    renderRow();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/pages/sparky/edit",
    );
  });

  // The person row is the account, not a character. Offering delete on it would
  // be offering to delete the person.
  // **The person's page is edited from here, in the same editor a fursona
  // uses.** What they do not get is the three controls beside it, and each
  // absence follows from what a person actor is: nothing to pin when the row is
  // always first, nothing to reorder against, and no retiring yourself.
  it("offers the person an edit link and nothing else", () => {
    renderRow({
      actor: actor({ kind: "person", handle: "u-abc", displayName: null }),
    });
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/me/edit",
    );
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pin" })).toBeNull();
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("offers no drag handle when arranging is off", () => {
    renderRow({ canArrange: false });
    expect(
      screen.queryByRole("button", { name: "Drag to reorder" }),
    ).toBeNull();
  });

  // THE GRIP THE LIST HANDED IT, IN THE ROW, AND NOT A COPY OF ONE.
  //
  // The row draws no grip of its own any more: `FursonaList` builds it, wires
  // it, and hands it down, so the four things `useSortable` returns are spread
  // in exactly one place. What this asserts is the half that belongs to the
  // row — that the element it is given is rendered, at the head of the row
  // rather than swallowed. Whether that element can actually start a drag is
  // `block-slot.test.tsx`'s and the browser suite's, because a props-shaped
  // assertion here would pass on a grip nothing had wired.
  it("renders the grip the list handed it", () => {
    renderRow({
      drag: {
        ref: () => {},
        style: {},
        handle: (
          <button type="button" aria-label="Drag to reorder">
            grip
          </button>
        ),
      },
    });
    expect(
      screen.getByRole("button", { name: "Drag to reorder" }),
    ).toBeInTheDocument();
  });

  // A row that may not be arranged is handed nothing, and must not invent a
  // grip of its own to fill the gap.
  it("offers no drag handle when the list hands it none", () => {
    renderRow({ drag: null });
    expect(
      screen.queryByRole("button", { name: "Drag to reorder" }),
    ).toBeNull();
  });

  it("asks before deleting", () => {
    const { onDelete } = renderRow();
    click("Delete");
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("deletes once confirmed", () => {
    const { onDelete } = renderRow();
    click("Delete");
    click("Confirm");
    expect(onDelete).toHaveBeenCalledWith("ref-1");
  });

  it("does not delete when the confirm is dismissed", () => {
    const { onDelete } = renderRow();
    click("Delete");
    click("Cancel");
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("pins on request", () => {
    const { onPin } = renderRow();
    click("Pin");
    expect(onPin).toHaveBeenCalledWith("ref-1", true);
  });

  it("offers to unpin what is already pinned", () => {
    const { onPin } = renderRow({ featured: true });
    click("Unpin");
    expect(onPin).toHaveBeenCalledWith("ref-1", false);
  });
});

describe("the link to the public page", () => {
  // **Only where there is a page to see.** A `private` actor answers 404 to
  // everybody, its owner included, so a link would send somebody to a dead end
  // and teach them the feature is broken.
  it.each(["public", "unlisted"] as const)(
    "offers it for a %s fursona",
    (visibility) => {
      renderRow({ address: "42", actor: actor({ visibility }) });
      expect(screen.getByTitle("See the public page")).toHaveAttribute(
        "href",
        expect.stringContaining("/42/sparky"),
      );
    },
  );

  it("offers none for a private fursona", () => {
    renderRow({ address: "42", actor: actor({ visibility: "private" }) });
    expect(screen.queryByTitle("See the public page")).toBeNull();
  });

  // The address is optional because a row cannot assume its caller fetched one.
  // Without it there is no page to point at, so nothing is offered.
  it("offers none without an address", () => {
    renderRow({ actor: actor({ visibility: "public" }) });
    expect(screen.queryByTitle("See the public page")).toBeNull();
  });

  // A person's own profile is the bare address; a fursona's is that plus its
  // handle. Getting these the same way round is the whole point of the path.
  it("points a person at their address alone", () => {
    renderRow({ address: "42", actor: actor({ kind: "person" }) });
    const href = screen.getByTitle("See the public page").getAttribute("href");
    expect(href).toContain("/42");
    expect(href).not.toContain("/sparky");
  });
});
