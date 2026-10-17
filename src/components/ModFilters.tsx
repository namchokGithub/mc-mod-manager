import { LayoutGrid, List, Search, SlidersHorizontal } from "lucide-react";
import type { Filters } from "../lib/mods";

export function ModFilters({
  filters,
  onChange,
  categories,
  count,
  view,
  onViewChange,
  showView = true,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: string[];
  count: number;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  showView?: boolean;
}) {
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="filters-panel">
      <div className="filters-top">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">Search mods</span>
          <input
            value={filters.query}
            onChange={(event) => set("query", event.target.value)}
            placeholder="Search mods by name or description..."
          />
        </label>
        {showView && (
          <div className="view-toggle" role="group" aria-label="View layout">
            <button
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={view === "grid" ? "selected" : ""}
              onClick={() => onViewChange?.("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
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
          <SlidersHorizontal size={15} /> Filter by
        </span>
        <label>
          <span className="sr-only">Category</span>
          <select
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
        <span className="result-count">
          {count} {count === 1 ? "mod" : "mods"}
        </span>
      </div>
    </div>
  );
}
