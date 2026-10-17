import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpCircle,
  ChevronDown,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { CompatBadge, CompatReasons } from "../../components/CompatBadge";
import { Button } from "../../components/ui/button";
import {
  compatLabels,
  countByStatus,
  type CompatResult,
  type CompatStatus,
} from "../../lib/compatibility";
import type { Mod } from "../../lib/schema";
import {
  updateLabels,
  type UpdateResult,
  type UpdateStatus,
} from "../../lib/updates";

const updateOrder: UpdateStatus[] = [
  "update-available",
  "up-to-date",
  "unknown",
];
const timeOf = (date: Date) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const order: CompatStatus[] = [
  "incompatible",
  "warning",
  "unknown",
  "compatible",
];

export function CompatibilityPanel({
  mods,
  results,
  checking,
  checkedAt,
  onCheck,
  updates,
  updatesCheckedAt,
  checkingUpdates,
  onCheckUpdates,
}: {
  mods: Mod[];
  results: Map<string, CompatResult>;
  checking: boolean;
  checkedAt: Date | null;
  onCheck: () => void;
  updates: Map<string, UpdateResult> | null;
  updatesCheckedAt: Date | null;
  checkingUpdates: boolean;
  onCheckUpdates: () => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = countByStatus(results);
  // Only linked mods can be checked, and a result is dropped once that mod changes version.
  const updateCounts = { "update-available": 0, "up-to-date": 0, unknown: 0 };
  for (const mod of mods) {
    const result = updates?.get(mod.id);
    if (
      mod.modrinth &&
      result &&
      result.checkedVersionId === mod.modrinth.versionId
    )
      updateCounts[result.status] += 1;
  }
  const issues = mods
    .flatMap((mod) => {
      const result = results.get(mod.id);
      return result && result.status !== "compatible" ? [{ mod, result }] : [];
    })
    .sort(
      (a, b) =>
        order.indexOf(a.result.status) - order.indexOf(b.result.status) ||
        a.mod.name.localeCompare(b.mod.name),
    );

  return (
    <section className="compat-panel" aria-label="Compatibility check">
      <div className="compat-panel-head">
        <div className="compat-panel-title">
          <ShieldCheck size={18} aria-hidden="true" />
          <div>
            <h3>Compatibility & updates</h3>
            <p>
              {checkedAt
                ? `Compatibility checked live on Modrinth at ${timeOf(checkedAt)}.`
                : "Compatibility uses saved Modrinth metadata. Disabled and removed mods are skipped."}
              {updatesCheckedAt &&
                ` Updates checked at ${timeOf(updatesCheckedAt)}.`}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="small"
          disabled={checking}
          onClick={onCheck}
        >
          {checking ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <ShieldCheck size={15} aria-hidden="true" />
          )}
          {checking ? "Checking…" : "Check compatibility"}
        </Button>
        <Button
          variant="secondary"
          size="small"
          disabled={checkingUpdates}
          onClick={onCheckUpdates}
        >
          {checkingUpdates ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <ArrowUpCircle size={15} aria-hidden="true" />
          )}
          {checkingUpdates ? "Checking…" : "Check updates"}
        </Button>
      </div>
      <div className="compat-counts" role="status">
        {order.map((status) => (
          <span key={status} className={`compat-count compat-${status}`}>
            <strong>{counts[status]}</strong> {compatLabels[status]}
          </span>
        ))}
      </div>
      {updates && (
        <div className="compat-counts" role="status">
          {updateOrder.map((status) => (
            <span key={status} className={`compat-count update-${status}`}>
              <strong>{updateCounts[status]}</strong> {updateLabels[status]}
            </span>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <>
          <button
            type="button"
            className="compat-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Hide" : "Show"} {issues.length}{" "}
            {issues.length === 1 ? "mod that needs" : "mods that need"}{" "}
            attention
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={open ? "rotate" : undefined}
            />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.ul
                className="compat-issues"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {issues.map(({ mod, result }) => (
                  <li key={mod.id}>
                    <div className="compat-issue-head">
                      <strong>{mod.name}</strong>
                      <CompatBadge status={result.status} />
                    </div>
                    <CompatReasons result={result} />
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}
