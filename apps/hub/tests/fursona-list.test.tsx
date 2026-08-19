import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

let filters = { q: "", visibility: "" };
vi.mock("nuqs", () => ({
  useQueryStates: () => [filters, vi.fn()],
  parseAsString: { withDefault: () => ({}) },
}));

// **The drag library is NOT mocked here, and that is deliberate.** The mock
// this file used to carry supplied what the real hook would have and so could
// not observe whether the component passed any of it on — the exact blindness
// that let a dead grip ship once already. `@dnd-kit`'s hooks fall back to
// their own default context outside a provider and register no ResizeObserver
// while nothing is being dragged, so the real thing renders here with no
// stubbing at all. What actually STARTS this grip is proved in
// `fursona-drag-reorder.spec.ts`, which drives a real keyboard drag in a real
// browser — NOT in `block-slot.test.tsx`, which a comment here used to credit
// and which tests the editor's grip, a different component with its own four
// props.

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
  drag: {
    instructions: "Space to pick up, arrows to move, space to drop.",
    lifted: "Picked up",
    over: "Moved over",
    dropped: "Dropped on",
    cancelled: "Left where it was.",
  },
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

  // THE HALF NOTHING ELSE CATCHES. `listeners` and `setNodeRef` are covered by
  // the browser drag in `fursona-drag-reorder.spec.ts` — drop either and the
  // drag never starts or never lands. `attributes` is different: this grip is
  // already a `<button>`, so losing them leaves it focusable, clickable and
  // completely unannounced, which no screenshot and no drag would show.
  // `block-slot.test.tsx` has this assertion for the editor's grip; the row's
  // had none.
  it("puts the library's own aria attributes on the grip", () => {
    renderList([
      actor({ actorRef: "a", handle: "aaa" }),
      actor({ actorRef: "b", handle: "bbb" }),
    ]);
    const [grip] = screen.getAllByRole("button", { name: "Drag to reorder" });
    // `sortable` rather than `draggable`: this list uses `useSortable`, which
    // overrides the base hook's word. The editor's grip is a plain
    // `useDraggable` and says `draggable`, which is why the two assertions
    // differ.
    expect(grip).toHaveAttribute("aria-roledescription", "sortable");
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
