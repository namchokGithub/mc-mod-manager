import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, GitBranch } from "lucide-react";
import {
  batchDependencyOverview,
  placementText,
  relationLabels,
  sourceLabels,
  type DependencyEntry,
  type DependencyRelation,
} from "../lib/dependencyOverview";
import type { BatchFile, Mod } from "../lib/schema";
import { Select } from "./ui/select";

type Filter =
  "all" | "missing" | "unresolved" | "later" | "resolved" | "unknown";

const filterOptions: { value: Filter; label: string }[] = [
  { value: "all", label: "All dependencies" },
  { value: "missing", label: "Missing" },
  { value: "unresolved", label: "Unresolved" },
  { value: "later", label: "Only in a later batch" },
  { value: "resolved", label: "Found" },
  { value: "unknown", label: "Unknown metadata" },
];

const groups: { title: string; relations: DependencyRelation[] }[] = [
  { title: "Required", relations: ["required"] },
  { title: "Optional", relations: ["optional"] },
  { title: "Conflicts", relations: ["incompatible", "discouraged"] },
];

/** Badge text and colour (reusing the compatibility badge styles) for one entry. */
function entryBadge(entry: DependencyEntry): { text: string; tone: string } {
  const conflict =
    entry.relation === "incompatible" || entry.relation === "discouraged";
  if (entry.status === "unresolved")
    return { text: "Unresolved", tone: "unknown" };
  if (conflict)
    return entry.status === "resolved"
      ? { text: "In the pack", tone: "warning" }
      : { text: "Not in the pack", tone: "compatible" };
  if (entry.status === "missing")
    return entry.relation === "required"
      ? { text: "Missing", tone: "incompatible" }
      : { text: "Not in the list", tone: "unknown" };
  if (entry.laterOnly) return { text: "Later batch", tone: "warning" };
  return entry.linked
    ? { text: "Found (linked)", tone: "compatible" }
    : { text: "Found", tone: "compatible" };
}

function matches(entry: DependencyEntry, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "later") return entry.laterOnly;
  if (filter === "unknown") return false;
  return entry.status === filter;
}

/**
 * Read-only dependency overview for one batch. Used in Manage and Preview; it never edits or
 * moves anything.
 */
export function DependencyOverview({
  batchId,
  plan,
  mods,
  onOpenMod,
}: {
  batchId: string;
  plan: BatchFile;
  mods: Mod[];
  onOpenMod?: (mod: Mod) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const id = useId();
  const overview = batchDependencyOverview(batchId, plan, mods);
  if (!overview.mods.length) return null;
  const { counts } = overview;
  const shown = overview.mods
    .map((item) => ({
      ...item,
      entries: item.entries.filter((entry) => matches(entry, filter)),
    }))
    .filter((item) =>
      filter === "all"
        ? true
        : filter === "unknown"
          ? item.source === "unknown"
          : item.entries.length > 0,
    );

  return (
    <section className="deps" aria-labelledby={`${id}-title`}>
      <button
        type="button"
        className="deps-toggle"
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((value) => !value)}
      >
        <GitBranch size={15} aria-hidden="true" />
        <span id={`${id}-title`}>Dependency overview</span>
        <span className="deps-counts">
          <span className="compat-count compat-compatible">
            <strong>{counts.resolved}</strong> found
          </span>
          <span className="compat-count compat-incompatible">
            <strong>{counts.missing}</strong> missing
          </span>
          <span className="compat-count compat-unknown">
            <strong>{counts.unresolved}</strong> unresolved
          </span>
          <span className="compat-count compat-unknown">
            <strong>{counts.unknown}</strong> unknown
          </span>
          {counts.later > 0 && (
            <span className="compat-count compat-warning">
              <strong>{counts.later}</strong> later batch
            </span>
          )}
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={open ? "rotate" : undefined}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`${id}-body`}
            className="plan-collapse"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="deps-body">
              <div className="deps-filter">
                <Select
                  aria-label="Filter dependencies by status"
                  size="sm"
                  variant="compact"
                  value={filter}
                  onValueChange={(value) => setFilter(value as Filter)}
                  options={filterOptions}
                />
              </div>
              {shown.length ? (
                <ul className="deps-mods">
                  {shown.map(({ mod, source, entries }) => (
                    <li key={mod.id} className="deps-mod">
                      <div className="deps-mod-head">
                        <strong>{mod.name}</strong>
                        <span className="deps-source">
                          {source === "manual"
                            ? "Manual (not verified)"
                            : source === "unknown"
                              ? "Unknown"
                              : `From ${sourceLabels[source]}`}
                        </span>
                      </div>
                      {source === "unknown" ? (
                        <p className="mr-hint">
                          No dependency metadata. Its dependencies are unknown,
                          not “none”. Link it to Modrinth, import its JAR, or
                          list exact mod IDs in its Dependencies field.
                        </p>
                      ) : filter === "all" && !entries.length ? (
                        <p className="mr-hint">
                          {sourceLabels[source]} lists no dependencies.
                        </p>
                      ) : (
                        groups.map(({ title, relations }) => {
                          const list = entries.filter((entry) =>
                            relations.includes(entry.relation),
                          );
                          if (!list.length) return null;
                          return (
                            <div key={title} className="deps-group">
                              <h5>{title}</h5>
                              <ul>
                                {list.map((entry) => {
                                  const badge = entryBadge(entry);
                                  const where = placementText(entry);
                                  return (
                                    <li key={entry.key}>
                                      <span
                                        className={`compat-badge compat-${badge.tone}`}
                                      >
                                        {badge.text}
                                      </span>
                                      <span className="deps-entry">
                                        {entry.target && onOpenMod ? (
                                          <button
                                            type="button"
                                            className="plan-mod-open"
                                            onClick={() =>
                                              onOpenMod(entry.target!)
                                            }
                                          >
                                            {entry.label}
                                          </button>
                                        ) : (
                                          <strong>{entry.label}</strong>
                                        )}
                                        {entry.identifier &&
                                          entry.identifier !== entry.label && (
                                            <code>{entry.identifier}</code>
                                          )}
                                        {entry.relation !== "required" &&
                                          entry.relation !== "optional" && (
                                            <span className="deps-relation">
                                              {relationLabels[entry.relation]}
                                            </span>
                                          )}
                                        <span className="deps-detail">
                                          {where || entry.reason}
                                        </span>
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mr-hint">No dependencies match this filter.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
