import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let filters = { q: "", visibility: "" };
vi.mock("nuqs", () => ({
  useQueryStates: () => [filters, vi.fn()],
  parseAsString: { withDefault: () => ({}) },
}));

// The drag library renders through render props. Flattening it here keeps this
// a test of ordering and of when dragging is offered, rather than of the
// library's own behaviour — which is its to test, not ours.
vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  Droppable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      droppableProps: Record<string, never>;
      placeholder: null;
    }) => ReactNode;
  }) => (
    <>
      {children({ innerRef: undefined, droppableProps: {}, placeholder: null })}
    </>
  ),
  Draggable: ({
    children,
  }: {
    children: (p: {
      innerRef: undefined;
      draggableProps: Record<string, never>;
      dragHandleProps: Record<string, never>;
    }) => ReactNode;
  }) => (
    <>
      {children({
        innerRef: undefined,
        draggableProps: {},
        dragHandleProps: {},
      })}
    </>
  ),
}));

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

const useFursonas = vi.fn();
vi.mock("@/features/actors/application/use-fursonas", () => ({
  useFursonas: (...a: unknown[]) => useFursonas(...a),
  FURSONAS_QUERY_KEY: "fursonas",
}));

const remove = { mutate: vi.fn() };
const reorder = { mutate: vi.fn() };
const pin = { mutate: vi.fn() };
vi.mock("@/features/actors/application/use-fursona-mutations", () => ({
  useFursonaMutations: () => ({ remove, reorder, pin }),
}));

const { FursonaList } =
  await import("@/features/actors/presentation/fursona-list");

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
  search: "Search",
  all: "All",
  empty: "No fursonas yet",
  noMatches: "Nothing matches that",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
};

/**
 * An actor row, with overrides.
 *
 * @param over - fields to replace.
 * @returns the actor.
 */
const actor = (over: Record<string, unknown> = {}) => ({
  actorRef: "ref-1",
  kind: "fursona",
  handle: "sparky",
  displayName: null,
  avatarUrl: null,
  visibility: "public",
  status: "active",
  ...over,
});

const person = actor({ kind: "person", actorRef: "p-1", handle: "u-abc" });

/**
 * Renders the list with the given rows and arrangement.
 *
 * @param rows - the actors to show.
 * @param arrangement - their arrangement rows.
 */
function renderList(rows: unknown[], arrangement: unknown[] = []): void {
  useFursonas.mockReturnValue({ rows, arrangement });
  render(<FursonaList initial={rows as never} labels={labels} />);
}

/** The handles rendered, in the order they appear. */
const handles = () =>
  screen.getAllByText(/^@/).map((el) => el.textContent?.replace("@", "") ?? "");

beforeEach(() => {
  filters = { q: "", visibility: "" };
  useFursonas.mockReset();
  reorder.mutate.mockReset();
  remove.mutate.mockReset();
  pin.mutate.mockReset();
});

describe("FursonaList", () => {
  it("says so when the person owns no fursonas", () => {
    renderList([person]);
    expect(screen.getByText("No fursonas yet")).toBeInTheDocument();
  });

  // "You have no fursonas" is wrong and discouraging when the truth is "none
  // match what you typed" — and it invites somebody to create a duplicate of
  // one they already have.
  it("says something different when a filter matches nothing", () => {
    filters = { q: "zzz", visibility: "" };
    renderList([person, actor({ handle: "sparky" })]);
    expect(screen.getByText("Nothing matches that")).toBeInTheDocument();
    expect(screen.queryByText("No fursonas yet")).toBeNull();
  });

  it("puts pinned fursonas first", () => {
    renderList(
      [
        actor({ actorRef: "a", handle: "aaa" }),
        actor({ actorRef: "b", handle: "bbb" }),
      ],
      [{ actorRef: "b", sortOrder: null, featured: true }],
    );
    expect(handles()).toEqual(["bbb", "aaa"]);
  });

  it("orders by the arrangement before falling back to the handle", () => {
    renderList(
      [
        actor({ actorRef: "a", handle: "aaa" }),
        actor({ actorRef: "b", handle: "bbb" }),
        actor({ actorRef: "c", handle: "ccc" }),
      ],
      [
        { actorRef: "c", sortOrder: 1, featured: false },
        { actorRef: "a", sortOrder: 2, featured: false },
      ],
    );
    // Arranged rows first in their order, then anything never arranged.
    expect(handles()).toEqual(["ccc", "aaa", "bbb"]);
  });

  it("keeps the person row at the top, above any pin", () => {
    renderList(
      [person, actor({ actorRef: "a", handle: "aaa" })],
      [{ actorRef: "a", sortOrder: null, featured: true }],
    );
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("You");
  });

  it("offers a drag handle when nothing is filtered", () => {
    renderList([
      actor({ actorRef: "a", handle: "aaa" }),
      actor({ actorRef: "b", handle: "bbb" }),
    ]);
    expect(
      screen.getAllByRole("button", { name: "Drag to reorder" }),
    ).toHaveLength(2);
  });

  // A reorder computed from a narrowed view would move rows the person cannot
  // see. The studio disables it for the same reason.
  //
  // The filter deliberately matches BOTH rows. An earlier version searched for
  // one handle, which narrowed the list to a single fursona — so the
  // single-fursona rule below hid the handle and this test passed without the
  // filtering guard existing at all. Sabotage is what exposed that.
  it("offers no drag handle while filtering", () => {
    filters = { q: "aa", visibility: "" };
    renderList([
      actor({ actorRef: "a", handle: "aaa" }),
      actor({ actorRef: "b", handle: "aab" }),
    ]);
    expect(handles()).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Drag to reorder" }),
    ).toBeNull();
  });

  // One fursona cannot be reordered against anything.
  it("offers no drag handle for a single fursona", () => {
    renderList([person, actor({ actorRef: "a", handle: "aaa" })]);
    expect(
      screen.queryByRole("button", { name: "Drag to reorder" }),
    ).toBeNull();
  });
});
