import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, LoaderCircle, ShieldCheck } from "lucide-react";
import { CompatBadge, CompatReasons } from "../../components/CompatBadge";
import { Button } from "../../components/ui/button";
import {
  compatLabels,
  countByStatus,
  type CompatResult,
  type CompatStatus,
} from "../../lib/compatibility";
import type { Mod } from "../../lib/schema";

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
}: {
  mods: Mod[];
  results: Map<string, CompatResult>;
  checking: boolean;
  checkedAt: Date | null;
  onCheck: () => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = countByStatus(results);
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
            <h3>Compatibility</h3>
            <p>
              {checkedAt
                ? `Checked live on Modrinth at ${checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                : "Based on saved Modrinth metadata. Disabled and removed mods are skipped."}
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
      </div>
      <div className="compat-counts" role="status">
        {order.map((status) => (
          <span key={status} className={`compat-count compat-${status}`}>
            <strong>{counts[status]}</strong> {compatLabels[status]}
          </span>
        ))}
      </div>
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
