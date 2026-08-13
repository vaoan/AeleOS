import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

let values = { q: "", visibility: "" };

/** nuqs's setter shape: a patch, and how it should touch history. */
type SetValues = (
  patch: Record<string, string | null>,
  options?: { history: "push" | "replace" },
) => void;

// Typed with both parameters, because the assertions read the second one. A
// one-parameter implementation makes `calls[0][1]` a tuple error rather than
// undefined, so this has to be declared even though the body ignores it.
const setValues = vi.fn<SetValues>((patch) => {
  values = {
    q: patch.q === undefined ? values.q : (patch.q ?? ""),
    visibility:
      patch.visibility === undefined
        ? values.visibility
        : (patch.visibility ?? ""),
  };
});

// nuqs owns the URL; the component owns when to write to it. Mocking the hook
// keeps this a test of that decision rather than of Next's router.
vi.mock("nuqs", () => ({
  useQueryStates: () => [values, setValues],
  parseAsString: { withDefault: () => ({}) },
}));

const { FursonaFiltersBar } =
  await import("@/features/actors/presentation/fursona-filters-bar");

const labels = {
  search: "Search fursonas",
  all: "All",
  visibility: { private: "Private", unlisted: "Unlisted", public: "Public" },
};

/** Advances past the debounce inside act, so React flushes the write. */
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  values = { q: "", visibility: "" };
  setValues.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FursonaFiltersBar", () => {
  it("offers a search box and one pill per visibility, plus all", () => {
    render(<FursonaFiltersBar labels={labels} />);
    expect(
      screen.getByRole("searchbox", { name: "Search fursonas" }),
    ).toBeInTheDocument();
    for (const name of ["All", "Private", "Unlisted", "Public"])
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
  });

  // Writing on every keystroke would put one history entry per character in the
  // URL and re-render the list on each one.
  it("does not write the search to the URL on every keystroke", () => {
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "spa" },
    });
    expect(setValues).not.toHaveBeenCalled();
  });

  it("writes the search once typing settles", () => {
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "spa" },
    });
    advance(500);
    expect(setValues).toHaveBeenCalledWith(
      { q: "spa" },
      { history: "replace" },
    );
  });

  // Replace, not push: a back button that walks back through every prefix of
  // what somebody typed is a trap, not history.
  it("replaces rather than pushing for the search", () => {
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "x" },
    });
    advance(500);
    expect(setValues.mock.calls[0]?.[1]).toEqual({ history: "replace" });
  });

  it("clears the search parameter rather than storing an empty string", () => {
    values = { q: "old", visibility: "" };
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    advance(500);
    expect(setValues).toHaveBeenCalledWith({ q: null }, { history: "replace" });
  });

  it("sets a visibility immediately, with no debounce", () => {
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Public" }));
    expect(setValues).toHaveBeenCalledWith(
      { visibility: "public" },
      { history: "push" },
    );
  });

  it("clears the visibility when all is chosen", () => {
    values = { q: "", visibility: "public" };
    render(<FursonaFiltersBar labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(setValues).toHaveBeenCalledWith(
      { visibility: null },
      { history: "push" },
    );
  });

  it("marks the active pill, so the filter is visible without reading the URL", () => {
    values = { q: "", visibility: "public" };
    render(<FursonaFiltersBar labels={labels} />);
    expect(screen.getByRole("button", { name: "Public" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks all as active when nothing is filtered", () => {
    render(<FursonaFiltersBar labels={labels} />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
