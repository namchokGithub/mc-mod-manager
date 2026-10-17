import { useMemo, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  FileJson2,
  GitBranch,
  LayoutList,
  ListChecks,
  PackageOpen,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { Button } from "../../components/ui/button";
import { sourceLabels } from "../../lib/dependencyOverview";
import { planningDashboard } from "../../lib/planningDashboard";
import type { Mod } from "../../lib/schema";

const LIMIT = 8;

function Group<T>({
  id,
  title,
  description,
  items,
  empty,
  render,
}: {
  id?: string;
  title: string;
  description: string;
  items: T[];
  empty: string;
  render: (item: T, index: number) => ReactNode;
}) {
  return (
    <section id={id} className="dash-group" aria-label={title}>
      <div className="dash-group-head">
        <h4>{title}</h4>
        <span
          className={`compat-count ${items.length ? "compat-warning" : "compat-compatible"}`}
        >
          <strong>{items.length}</strong>
        </span>
      </div>
      <p className="mr-hint">{items.length ? description : empty}</p>
      {items.length > 0 && (
        <ul>
          {items.slice(0, LIMIT).map(render)}
          {items.length > LIMIT && (
            <li className="mr-hint">and {items.length - LIMIT} more</li>
          )}
        </ul>
      )}
    </section>
  );
}

/** Manage → Dashboard: read-only planning overview derived from the current data. */
export function PlanningDashboard({
  onOpenMod,
  onOpenBatch,
  onOpenPlan,
  onOpenMods,
}: {
  onOpenMod: (mod: Mod) => void;
  onOpenBatch: (batchId: string) => void;
  onOpenPlan: () => void;
  onOpenMods: () => void;
}) {
  const { data } = useCollection();
  const dashboard = useMemo(() => planningDashboard(data), [data]);
  const { health, attention } = dashboard;
  const modButton = (mod: Mod) => (
    <button
      type="button"
      className="plan-mod-open"
      onClick={() => onOpenMod(mod)}
    >
      {mod.name}
    </button>
  );
  const stats = [
    { label: "Total mods", value: dashboard.totalMods },
    { label: "Assigned mods", value: dashboard.assignedMods },
    { label: "Unassigned mods", value: dashboard.unassigned.length },
    { label: "Batches", value: dashboard.totalBatches },
  ];

  return (
    <motion.div
      className="dashboard"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="manage-section-head">
        <div>
          <h2>Planning dashboard</h2>
          <p>How organised the planned pack is, and what still needs a look.</p>
        </div>
      </div>

      <div className="dash-nav" role="group" aria-label="Quick navigation">
        <Button
          variant="secondary"
          size="small"
          onClick={() =>
            document
              .getElementById("dash-unassigned")
              ?.scrollIntoView({ block: "start" })
          }
        >
          <PackageOpen size={15} /> View unassigned mods
        </Button>
        <Button variant="secondary" size="small" onClick={onOpenPlan}>
          <ListChecks size={15} /> Open build plan
        </Button>
        <Button
          variant="secondary"
          size="small"
          onClick={() =>
            document
              .getElementById("dash-dependencies")
              ?.scrollIntoView({ block: "start" })
          }
        >
          <GitBranch size={15} /> Review dependencies
        </Button>
        <Button variant="secondary" size="small" onClick={onOpenMods}>
          <FileJson2 size={15} /> View mod list
        </Button>
      </div>

      <div className="dash-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="dash-stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="dash-cards">
        <section className="dash-card" aria-labelledby="dash-coverage-title">
          <h3 id="dash-coverage-title">Planning Coverage</h3>
          <p className="dash-big">
            {dashboard.coverage === null ? "—" : `${dashboard.coverage}%`}
          </p>
          <div
            className="dash-bar"
            role="progressbar"
            aria-labelledby="dash-coverage-title"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={dashboard.coverage ?? 0}
          >
            <span style={{ width: `${dashboard.coverage ?? 0}%` }} />
          </div>
          <p className="mr-hint">
            {dashboard.totalMods
              ? `${dashboard.assignedMods} of ${dashboard.totalMods} mods are in at least one batch.`
              : "Add mods to start planning."}{" "}
            This shows planning only, not installation or testing.
          </p>
        </section>

        <section
          id="dash-dependencies"
          className="dash-card"
          aria-labelledby="dash-health-title"
        >
          <h3 id="dash-health-title">Dependency health</h3>
          <div className="deps-counts">
            <span className="compat-count compat-compatible">
              <strong>{health.requiredResolved}</strong> required found
            </span>
            <span className="compat-count compat-incompatible">
              <strong>{health.requiredMissing}</strong> required missing
            </span>
            <span className="compat-count compat-unknown">
              <strong>{health.unresolved}</strong> unresolved
            </span>
            <span className="compat-count compat-unknown">
              <strong>{health.unknownMods}</strong> unknown metadata
            </span>
          </div>
          <p className="mr-hint">
            Optional: {health.optionalResolved} found, {health.optionalMissing}{" "}
            not in the list. Sources:{" "}
            {(["modrinth", "jar", "manual", "unknown"] as const)
              .map(
                (source) => `${sourceLabels[source]} ${health.sources[source]}`,
              )
              .join(", ")}
            .
          </p>
          {health.unknownMods > 0 && (
            <p className="mr-hint">
              {health.unknownMods}{" "}
              {health.unknownMods === 1 ? "mod has" : "mods have"} no dependency
              metadata, so a count of missing dependencies cannot show that
              everything is covered.
            </p>
          )}
        </section>
      </div>

      <section className="dash-card" aria-labelledby="dash-batches-title">
        <h3 id="dash-batches-title">Batches</h3>
        {dashboard.batches.length ? (
          <ol className="dash-batches">
            {dashboard.batches.map((item) => (
              <li key={item.batch.id}>
                <span className="plan-order" aria-hidden="true">
                  {item.position}
                </span>
                <span className="dash-batch-main">
                  <strong>{item.batch.name}</strong>
                  <span className="dash-bar dash-bar-small" aria-hidden="true">
                    <span
                      style={{
                        width: `${dashboard.totalMods ? (item.modCount / dashboard.totalMods) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span className="mr-hint">
                    {item.modCount} {item.modCount === 1 ? "mod" : "mods"}
                    {item.missingRequired
                      ? ` · ${item.missingRequired} required missing`
                      : ""}
                    {item.unresolved ? ` · ${item.unresolved} unresolved` : ""}
                    {item.later ? ` · ${item.later} only in a later batch` : ""}
                    {item.deletedRefs.length
                      ? ` · ${item.deletedRefs.length} deleted`
                      : ""}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={`Open batch ${item.position}, ${item.batch.name}`}
                  onClick={() => onOpenBatch(item.batch.id)}
                >
                  Open <ArrowRight size={14} />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mr-empty">
            <LayoutList size={22} aria-hidden="true" />
            <p>No batches yet. Create one in the build plan.</p>
            <Button variant="secondary" size="small" onClick={onOpenPlan}>
              Open build plan
            </Button>
          </div>
        )}
      </section>

      <section className="dash-card" aria-labelledby="dash-attention-title">
        <h3 id="dash-attention-title">Needs attention</h3>
        <div className="dash-groups">
          <Group
            id="dash-unassigned"
            title="Not in any batch"
            description="These mods are in the list but not planned into a batch."
            empty="Every mod is in at least one batch."
            items={attention.unassigned}
            render={(mod) => <li key={mod.id}>{modButton(mod)}</li>}
          />
          <Group
            title="Missing required dependencies"
            description="No mod in the list matches these by ID."
            empty="No missing required dependencies found in the available metadata."
            items={attention.missing}
            render={({ mod, entry }) => (
              <li key={`${mod.id}:${entry.key}`}>
                {modButton(mod)} needs <strong>{entry.label}</strong>
              </li>
            )}
          />
          <Group
            title="Unresolved dependencies"
            description="These could not be matched reliably."
            empty="Nothing unresolved."
            items={attention.unresolved}
            render={({ mod, entry }) => (
              <li key={`${mod.id}:${entry.key}`}>
                {modButton(mod)}: <strong>{entry.label}</strong>
                {entry.reason && (
                  <span className="mr-hint"> — {entry.reason}</span>
                )}
              </li>
            )}
          />
          <Group
            title="Required only in a later batch"
            description="The dependency is planned after the mod that needs it."
            empty="No required dependency is planned after the mod that needs it."
            items={attention.later}
            render={({ mod, entry, batch, position }) => (
              <li key={`${batch.id}:${mod.id}:${entry.key}`}>
                {modButton(mod)} in{" "}
                <button
                  type="button"
                  className="plan-mod-open"
                  onClick={() => onOpenBatch(batch.id)}
                >
                  Batch {position}
                </button>{" "}
                needs <strong>{entry.label}</strong>
              </li>
            )}
          />
          <Group
            title="Deleted mod references"
            description="Batches still list mods that are no longer in the mod list."
            empty="Every batch refers to existing mods."
            items={attention.deletedRefs}
            render={({ batch, position, ids }) => (
              <li key={batch.id}>
                <button
                  type="button"
                  className="plan-mod-open"
                  onClick={() => onOpenBatch(batch.id)}
                >
                  Batch {position}: {batch.name}
                </button>{" "}
                — {ids.join(", ")}
              </li>
            )}
          />
        </div>
      </section>
    </motion.div>
  );
}
