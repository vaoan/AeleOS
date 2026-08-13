/**
 * The only parts of an actor filtering looks at.
 *
 * Declared here rather than importing `Actor` from infrastructure, because
 * `domain/` is the innermost layer and must not depend on an outer one — the
 * eslint rule caught exactly that and its advice is what this is. Structural
 * typing means `Actor` satisfies it without either side knowing about the
 * other, and the functions stay generic so a caller gets its own type back.
 */
export interface FilterableActor {
  /** Person rows are exempt from filtering; fursonas are not. */
  kind: "person" | "fursona";
  /** Matched against the search text. */
  handle: string;
  /** Also matched, when there is one. */
  displayName: string | null;
  /** Compared against the visibility filter. */
  visibility: string;
}

/** What the list is currently filtered by. Empty strings mean "no filter". */
export interface FursonaFilters {
  /** Free text, matched against handle and display name. */
  q: string;
  /** One of the visibility values, or "" for all. */
  visibility: string;
}

/**
 * Whether any filter is actually narrowing the list.
 *
 * Whitespace does not count. A stray space would otherwise read as a filter and
 * silently disable drag-to-reorder, which is disabled while filtering because a
 * reorder computed from a narrowed view would move rows nobody can see.
 *
 * @param filters - the current filters.
 * @returns true when the list is narrowed.
 */
export function isFiltering(filters: FursonaFilters): boolean {
  return filters.q.trim() !== "" || filters.visibility !== "";
}

/**
 * Narrows the rows to those matching the filters.
 *
 * **The person row always survives.** It is the "you" row rather than a
 * fursona, and hiding it under a filter would read as the account itself
 * disappearing.
 *
 * Matching is case-insensitive across handle and display name, because somebody
 * looking for a fursona types the name they gave it at least as often as the
 * handle they registered.
 *
 * @param rows - every actor the person owns, person row first.
 * @param filters - the current filters.
 * @returns the rows to render, in the order given.
 */
export function applyFursonaFilters<T extends FilterableActor>(
  rows: T[],
  filters: FursonaFilters,
): T[] {
  const q = filters.q.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.kind === "person") return true;
    if (filters.visibility && row.visibility !== filters.visibility)
      return false;
    if (!q) return true;
    return `${row.handle} ${row.displayName ?? ""}`.toLowerCase().includes(q);
  });
}
