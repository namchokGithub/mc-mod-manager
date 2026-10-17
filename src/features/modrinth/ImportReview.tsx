import { ArrowLeft, Info, PackagePlus } from "lucide-react";
import { CompatBadge } from "../../components/CompatBadge";
import { Button } from "../../components/ui/button";
import { checkCompatibility, statusLabel } from "../../lib/compatibility";
import type { ImportPlan } from "../../lib/modrinth/dependencyImport";
import type { Mod, Modpack } from "../../lib/schema";

export type NotIncluded = { name: string; reason: string };

/** Last step of adding from Modrinth with dependencies: everything that will be added at once. */
export function ImportReview({
  plan,
  roles,
  mods,
  modpack,
  packLabel,
  alreadyInCollection,
  unresolved,
  onBack,
  onCancel,
  onConfirm,
}: {
  plan: ImportPlan;
  /** Role label per created mod ID, e.g. "Required dependency". */
  roles: Map<string, string>;
  mods: Mod[];
  modpack: Modpack;
  packLabel: string;
  alreadyInCollection: NotIncluded[];
  unresolved: NotIncluded[];
  onBack: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Checked together, so dependencies added in this import count as present.
  const compat = checkCompatibility([...mods, ...plan.created], modpack);
  const total = plan.created.length;
  return (
    <div className="mr-picker">
      <section className="mr-compat" aria-labelledby="mr-review-title">
        <h4 id="mr-review-title">
          Review {total} {total === 1 ? "mod" : "mods"} to add
        </h4>
        <p className="mr-hint">
          {packLabel
            ? `Checked for ${packLabel}.`
            : "The pack has no Minecraft version or modloader set."}
        </p>
        <ul className="mr-review-list">
          {plan.created.map((mod) => {
            const result = compat.get(mod.id);
            return (
              <li key={mod.id}>
                <span className="mr-review-main">
                  <strong>{mod.name}</strong>
                  <span className="mr-hint">
                    {mod.modrinth?.versionNumber ?? mod.version}
                    {mod.modrinth?.versionType
                      ? ` · ${mod.modrinth.versionType}`
                      : ""}
                  </span>
                </span>
                <span className="mr-chip mr-chip-muted">
                  {roles.get(mod.id) ?? "Dependency"}
                </span>
                {result && (
                  <CompatBadge
                    compact
                    status={result.status}
                    label={statusLabel(result)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {(alreadyInCollection.length > 0 || plan.skipped.length > 0) && (
        <section className="mr-compat">
          <h4>Already in the collection</h4>
          <ul className="jar-update-changes">
            {[...alreadyInCollection, ...plan.skipped].map((item) => (
              <li key={`${item.name}:${item.reason}`}>
                <strong>{item.name}</strong>: {item.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {unresolved.length > 0 && (
        <section className="mr-compat">
          <h4>Not added</h4>
          <ul className="jar-update-changes">
            {unresolved.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>: {item.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.stillMissing.length > 0 && (
        <section className="mr-compat">
          <h4>Still missing after adding</h4>
          {plan.stillMissing.map((item) => (
            <p
              className="jar-warning"
              key={`${item.modName}:${item.dependencyName}`}
            >
              <Info size={13} aria-hidden="true" />
              {item.modName} requires {item.dependencyName}. Add it separately.
            </p>
          ))}
        </section>
      )}

      <p className="mr-hint">
        All {total} are added together as Planned, with no batch assigned.
        Existing mods and the Mod Inbox are not changed.
      </p>
      <div className="dialog-actions">
        <Button variant="ghost" className="mr-manual" onClick={onBack}>
          <ArrowLeft size={15} /> Back to change selection
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>
          <PackagePlus size={16} /> Add {total} {total === 1 ? "mod" : "mods"}
        </Button>
      </div>
    </div>
  );
}
