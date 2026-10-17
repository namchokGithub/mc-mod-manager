import { useEffect, useRef } from "react";
import {
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Filters } from "../lib/mods";

export function ModFilters({
  filters,
  onChange,
  categories,
  count,
  total,
  view,
  onViewChange,
  showView = true,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: string[];
  count: number;
  total: number;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  showView?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });
  const activeCount =
    (filters.query.trim() ? 1 : 0) +
    [filters.category, filters.status, filters.side].filter(Boolean).length;
  const clearFilters = () =>
    onChange({ ...filters, query: "", category: "", status: "", side: "" });

  // Press "/" anywhere outside a field to jump to search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;
      if (document.querySelector("[role='dialog']")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="filters-panel">
      <div className="filters-top">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search mods</span>
          <input
            ref={searchRef}
            value={filters.query}
            onChange={(event) => set("query", event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && filters.query) {
                event.preventDefault();
                set("query", "");
              }
            }}
            placeholder="Search mods by name or description..."
            enterKeyHint="search"
            autoComplete="off"
          />
          {filters.query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                set("query", "");
                searchRef.current?.focus();
              }}
            >
              <X size={15} />
            </button>
          ) : (
            <kbd className="search-shortcut" aria-hidden="true">
              /
            </kbd>
          )}
        </label>
        {showView && (
          <div className="view-toggle" role="group" aria-label="View layout">
            <button
              type="button"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "selected" : ""}
              onClick={() => onViewChange?.("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              type="button"
              aria-label="List view"
              aria-pressed={view === "list"}
              className={view === "list" ? "selected" : ""}
              onClick={() => onViewChange?.("list")}
            >
              <List size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="filters-bottom">
        <span className="filter-label">
          <SlidersHorizontal size={15} aria-hidden="true" /> Filter by
        </span>
        <label>
          <span className="sr-only">Category</span>
          <select
            className={filters.category ? "is-active" : undefined}
            value={filters.category}
            onChange={(event) => set("category", event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select
            className={filters.status ? "is-active" : undefined}
            value={filters.status}
            onChange={(event) => set("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {["planned", "testing", "installed", "disabled", "removed"].map(
              (status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          <span className="sr-only">Installation side</span>
          <select
            className={filters.side ? "is-active" : undefined}
            value={filters.side}
            onChange={(event) => set("side", event.target.value)}
          >
            <option value="">All sides</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort order</span>
          <select
            value={filters.sort}
            onChange={(event) => set("sort", event.target.value)}
          >
            <option value="az">Name: A–Z</option>
            <option value="za">Name: Z–A</option>
          </select>
        </label>
        {activeCount > 0 && (
          <button type="button" className="filter-reset" onClick={clearFilters}>
            <RotateCcw size={13} aria-hidden="true" /> Clear {activeCount}{" "}
            {activeCount === 1 ? "filter" : "filters"}
          </button>
        )}
        <span className="result-count" role="status">
          {count === total
            ? `${total} ${total === 1 ? "mod" : "mods"}`
            : `${count} of ${total} mods`}
        </span>
      </div>
    </div>
  );
}
