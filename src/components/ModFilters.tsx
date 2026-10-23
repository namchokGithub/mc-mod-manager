import { useEffect, useRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  ChevronDown,
  LayoutGrid,
  List,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Filters } from "../lib/mods";
import { modStatusLabels, modStatuses, type Mod } from "../lib/schema";
import { liquidLens, positionGlassGlow } from "../lib/liquidLens";
import { modPriorities, priorityLabels } from "../lib/priority";
import { Select } from "./ui/select";

const statusOptions = modStatuses.map((status) => ({
  value: status,
  label: modStatusLabels[status],
}));

const sideOptions: { value: Mod["side"]; label: string }[] = [
  { value: "client", label: "Client" },
  { value: "server", label: "Server" },
  { value: "both", label: "Both" },
];

function MultiValueFilter<T extends string>({
  values,
  onChange,
  counts,
  total,
  allLabel,
  ariaLabel,
  options,
}: {
  /** `null` means the user explicitly selected no values. */
  values: readonly T[] | null;
  onChange: (values: T[] | null) => void;
  counts?: Readonly<Partial<Record<T, number>>>;
  total?: number;
  allLabel: string;
  ariaLabel: string;
  options: readonly { value: T; label: string }[];
}) {
  const selected = new Set(values ?? []);
  const allSelected =
    values !== null &&
    (values.length === 0 || values.length === options.length);
  const label = allSelected ? allLabel : `${selected.size} selected`;
  const toggle = (value: T) => {
    const next = new Set(
      allSelected ? options.map((option) => option.value) : selected,
    );
    if (next.has(value)) next.delete(value);
    else next.add(value);
    const nextValues = options
      .map((option) => option.value)
      .filter((option) => next.has(option));
    onChange(nextValues.length === options.length ? [] : nextValues);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className={`control-trigger control-sm control-compact filter-select${allSelected ? "" : " control-active"}`}
          aria-label={ariaLabel}
        >
          <span className="control-value">{label}</span>
          <ChevronDown
            className="control-chevron"
            size={15}
            aria-hidden="true"
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="status-filter-popover"
          sideOffset={4}
          collisionPadding={8}
        >
          <label className="status-filter-option status-filter-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? null : [])}
            />
            <span>{allLabel}</span>
            {total !== undefined && (
              <span className="status-filter-count">{total}</span>
            )}
          </label>
          {options.map((option) => (
            <label key={option.value} className="status-filter-option">
              <input
                type="checkbox"
                checked={allSelected || selected.has(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
              {counts && (
                <span className="status-filter-count">
                  {counts[option.value] ?? 0}
                </span>
              )}
            </label>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function ModFilters({
  filters,
  onChange,
  categories,
  count,
  total,
  view,
  onViewChange,
  showView = true,
  showSide = true,
  appearance = "default",
  assignment,
  onAssignmentChange,
  statusValues,
  onStatusValuesChange,
  statusCounts,
  statusTotal,
  categoryValues,
  onCategoryValuesChange,
  categoryCounts,
  categoryTotal,
  sideValues,
  onSideValuesChange,
  sideCounts,
  sideTotal,
  priorityValues,
  onPriorityValuesChange,
  priorityCounts,
  priorityTotal,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  categories: string[];
  count: number;
  total: number;
  view?: "grid" | "list";
  onViewChange?: (view: "grid" | "list") => void;
  showView?: boolean;
  /** False where a separate side control (Preview's For Players / For Server) is shown. */
  showSide?: boolean;
  /** Visual treatment only; Preview opts into glass while Manage retains the default surface. */
  appearance?: "default" | "glass";
  /** Optional because assignment is derived from the Build plan, not a generic mod field. */
  assignment?: "" | "assigned" | "unassigned";
  onAssignmentChange?: (value: "" | "assigned" | "unassigned") => void;
  /** Manage supplies these to enable checkbox multi-select without changing Preview. */
  statusValues?: readonly Mod["status"][] | null;
  onStatusValuesChange?: (values: Mod["status"][] | null) => void;
  /** Counts after all filters other than status; shown only in Manage's multi-select. */
  statusCounts?: Readonly<Record<Mod["status"], number>>;
  statusTotal?: number;
  categoryValues?: readonly string[] | null;
  onCategoryValuesChange?: (values: string[] | null) => void;
  categoryCounts?: Readonly<Record<string, number>>;
  categoryTotal?: number;
  sideValues?: readonly Mod["side"][] | null;
  onSideValuesChange?: (values: Mod["side"][] | null) => void;
  sideCounts?: Readonly<Record<Mod["side"], number>>;
  sideTotal?: number;
  priorityValues?: readonly (typeof modPriorities)[number][] | null;
  onPriorityValuesChange?: (
    values: (typeof modPriorities)[number][] | null,
  ) => void;
  priorityCounts?: Readonly<Record<(typeof modPriorities)[number], number>>;
  priorityTotal?: number;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });
  const hasStatusFilter =
    statusValues !== undefined
      ? statusValues === null ||
        (statusValues.length > 0 && statusValues.length < modStatuses.length)
      : Boolean(filters.status);
  const hasCategoryFilter =
    categoryValues !== undefined
      ? categoryValues === null ||
        (categoryValues.length > 0 && categoryValues.length < categories.length)
      : Boolean(filters.category);
  const hasSideFilter =
    sideValues !== undefined
      ? sideValues === null ||
        (sideValues.length > 0 && sideValues.length < sideOptions.length)
      : Boolean(filters.side);
  const hasPriorityFilter =
    priorityValues !== undefined
      ? priorityValues === null ||
        (priorityValues.length > 0 &&
          priorityValues.length < modPriorities.length)
      : Boolean(filters.priority);
  const activeCount =
    (filters.query.trim() ? 1 : 0) +
    [hasCategoryFilter, hasSideFilter, hasPriorityFilter].filter(Boolean)
      .length +
    (hasStatusFilter ? 1 : 0) +
    (assignment ? 1 : 0);
  const clearFilters = () => {
    onChange({
      ...filters,
      query: "",
      category: "",
      status: "",
      side: "",
      priority: "",
    });
    onAssignmentChange?.("");
    onStatusValuesChange?.([]);
    onCategoryValuesChange?.([]);
    onSideValuesChange?.([]);
    onPriorityValuesChange?.([]);
  };

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
    <div
      ref={appearance === "glass" ? liquidLens : undefined}
      className={`filters-panel${appearance === "glass" ? " filters-panel-glass glass-surface" : ""}`}
      onPointerMove={
        appearance === "glass"
          ? (event) =>
              positionGlassGlow(
                event.currentTarget,
                event.clientX,
                event.clientY,
              )
          : undefined
      }
    >
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
        {onCategoryValuesChange ? (
          <MultiValueFilter
            values={categoryValues === undefined ? [] : categoryValues}
            onChange={onCategoryValuesChange}
            counts={categoryCounts}
            total={categoryTotal}
            allLabel="All categories"
            ariaLabel="Category"
            options={categories.map((value) => ({ value, label: value }))}
          />
        ) : (
          <Select
            aria-label="Category"
            size="sm"
            variant="compact"
            className="filter-select"
            active={Boolean(filters.category)}
            value={filters.category}
            onValueChange={(value) => set("category", value)}
            options={[
              { value: "", label: "All categories" },
              ...categories.map((category) => ({
                value: category,
                label: category,
              })),
            ]}
          />
        )}
        {onAssignmentChange && (
          <Select
            aria-label="Plan assignment"
            size="sm"
            variant="compact"
            className="filter-select"
            active={Boolean(assignment)}
            value={assignment ?? ""}
            onValueChange={(value) =>
              onAssignmentChange(value as "" | "assigned" | "unassigned")
            }
            options={[
              { value: "", label: "All plan assignments" },
              { value: "assigned", label: "In plan" },
              { value: "unassigned", label: "Not in plan" },
            ]}
          />
        )}
        {onStatusValuesChange ? (
          <MultiValueFilter
            values={statusValues === undefined ? [] : statusValues}
            onChange={onStatusValuesChange}
            counts={statusCounts}
            total={statusTotal}
            allLabel="All statuses"
            ariaLabel="Status"
            options={statusOptions}
          />
        ) : (
          <Select
            aria-label="Status"
            size="sm"
            variant="compact"
            className="filter-select"
            active={Boolean(filters.status)}
            value={filters.status}
            onValueChange={(value) => set("status", value)}
            options={[{ value: "", label: "All statuses" }, ...statusOptions]}
          />
        )}
        {showSide &&
          (onSideValuesChange ? (
            <MultiValueFilter
              values={sideValues === undefined ? [] : sideValues}
              onChange={onSideValuesChange}
              counts={sideCounts}
              total={sideTotal}
              allLabel="All sides"
              ariaLabel="Installation side"
              options={sideOptions}
            />
          ) : (
            <Select
              aria-label="Installation side"
              size="sm"
              variant="compact"
              className="filter-select"
              active={Boolean(filters.side)}
              value={filters.side}
              onValueChange={(value) => set("side", value)}
              options={[{ value: "", label: "All sides" }, ...sideOptions]}
            />
          ))}
        {onPriorityValuesChange ? (
          <MultiValueFilter
            values={priorityValues === undefined ? [] : priorityValues}
            onChange={onPriorityValuesChange}
            counts={priorityCounts}
            total={priorityTotal}
            allLabel="All priorities"
            ariaLabel="Priority"
            options={modPriorities.map((value) => ({
              value,
              label: priorityLabels[value],
            }))}
          />
        ) : (
          <Select
            aria-label="Priority"
            size="sm"
            variant="compact"
            className="filter-select"
            active={Boolean(filters.priority)}
            value={filters.priority ?? ""}
            onValueChange={(value) => set("priority", value)}
            options={[
              { value: "", label: "All priorities" },
              ...modPriorities.map((value) => ({
                value,
                label: priorityLabels[value],
              })),
            ]}
          />
        )}
        <Select
          aria-label="Sort order"
          size="sm"
          variant="compact"
          className="filter-select"
          value={filters.sort}
          onValueChange={(value) => set("sort", value)}
          options={[
            { value: "az", label: "Name: A–Z" },
            { value: "za", label: "Name: Z–A" },
            { value: "added-desc", label: "Added: newest first" },
            { value: "added-asc", label: "Added: oldest first" },
            { value: "priority-desc", label: "Priority: highest first" },
            { value: "priority-asc", label: "Priority: lowest first" },
          ]}
        />
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
