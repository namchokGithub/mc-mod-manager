export const PAGE_SIZES = [9, 18, 27, 54, 109, 218, 436] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 9;

export type Page<T> = {
  items: T[];
  /** 1-based page, clamped into range. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based position of the first item shown; 0 when there are no items. */
  from: number;
  /** 1-based position of the last item shown; 0 when there are no items. */
  to: number;
};

/**
 * Slices already filtered and sorted items. An out-of-range page (for example after deletions
 * shrink the list) is clamped instead of showing an empty page.
 */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): Page<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return {
    items: pageItems,
    page: current,
    pageCount,
    total,
    from: total ? start + 1 : 0,
    to: start + pageItems.length,
  };
}

export type PageSelection = "none" | "some" | "all";

/** How much of the visible page is selected, for the Select All checkbox. */
export function pageSelectionState(
  selected: ReadonlySet<string>,
  pageIds: string[],
): PageSelection {
  const count = pageIds.filter((id) => selected.has(id)).length;
  if (!count) return "none";
  return count === pageIds.length ? "all" : "some";
}

/** Selects or clears only the given page's IDs; selections on other pages are kept. */
export function setPageSelected(
  selected: ReadonlySet<string>,
  pageIds: string[],
  checked: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const id of pageIds) {
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function toggleSelected(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Drops IDs that no longer exist, such as after a delete or an import. */
export function pruneSelection(
  selected: ReadonlySet<string>,
  existingIds: Iterable<string>,
): Set<string> {
  const existing = new Set(existingIds);
  return new Set([...selected].filter((id) => existing.has(id)));
}
