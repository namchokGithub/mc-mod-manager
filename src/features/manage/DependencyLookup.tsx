import { useId, useMemo, useState } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import { ModArtwork } from "../../components/ModArtwork";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import {
  collectionDependencyLookup,
  relationLabels,
  sourceLabels,
  type DependencyEntry,
  type DependencySource,
} from "../../lib/dependencyOverview";
import type { Mod } from "../../lib/schema";

function sourceText(source: DependencySource): string {
  return source === "manual"
    ? "Manual entry (not verified)"
    : source === "unknown"
      ? "Unknown metadata"
      : sourceLabels[source];
}

function DependencyRow({
  entry,
  onOpenMod,
}: {
  entry: DependencyEntry;
  onOpenMod: (mod: Mod) => void;
}) {
  const conflict =
    entry.relation === "incompatible" || entry.relation === "discouraged";
  const badge =
    entry.status === "unresolved"
      ? { label: "Unresolved", tone: "unknown" }
      : conflict
        ? entry.status === "resolved"
          ? { label: "In collection", tone: "warning" }
          : { label: "Not in collection", tone: "compatible" }
        : entry.status === "missing"
          ? entry.relation === "required"
            ? { label: "Missing", tone: "incompatible" }
            : { label: "Not in collection", tone: "unknown" }
          : { label: "Found", tone: "compatible" };
  const target = entry.target;
  return (
    <li className="lookup-row">
      <span className={`compat-badge compat-${badge.tone}`}>{badge.label}</span>
      <div>
        {target ? (
          <button
            type="button"
            className="plan-mod-open"
            onClick={() => onOpenMod(target)}
          >
            {entry.label}
          </button>
        ) : (
          <strong>{entry.label}</strong>
        )}
        <p>
          {relationLabels[entry.relation]} · {sourceText(entry.source)}
          {entry.linked ? " · Confirmed link" : ""}
        </p>
        {entry.reason && <small>{entry.reason}</small>}
      </div>
    </li>
  );
}

/** Read-only, collection-wide lookup in both dependency directions. */
export function DependencyLookup({
  mods,
  onOpenMod,
}: {
  mods: Mod[];
  onOpenMod: (mod: Mod) => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const labelId = useId();
  const options = useMemo(
    () =>
      [...mods]
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        )
        .map((mod) => ({ value: mod.id, label: `${mod.name} · ${mod.id}` })),
    [mods],
  );
  const lookup = useMemo(
    () =>
      selectedId ? collectionDependencyLookup(selectedId, mods) : undefined,
    [selectedId, mods],
  );

  return (
    <div className="dependency-lookup">
      <div className="manage-section-head">
        <div>
          <h2>Dependency lookup</h2>
          <p>
            See a mod’s dependencies and which mods in this collection need it.
          </p>
        </div>
      </div>
      <div className="lookup-picker">
        <label id={labelId}>Find a mod by name</label>
        <Combobox
          aria-labelledby={labelId}
          options={options}
          value={lookup ? selectedId : ""}
          onValueChange={setSelectedId}
          placeholder="Choose a mod"
          searchPlaceholder="Search mod names…"
          emptyText="No mods match that name."
        />
      </div>
      {lookup ? (
        <>
          <div className="lookup-selected">
            <ModArtwork name={lookup.mod.name} imageUrl={lookup.mod.imageUrl} />
            <div>
              <strong>{lookup.mod.name}</strong>
              <p>
                {lookup.mod.version || "Version not set"} · {lookup.mod.source}
              </p>
            </div>
            <Button
              variant="secondary"
              size="small"
              onClick={() => onOpenMod(lookup.mod)}
            >
              Open mod <ArrowRight size={14} />
            </Button>
          </div>
          <div className="lookup-columns">
            <section
              className="lookup-panel"
              aria-labelledby="lookup-needs-title"
            >
              <div className="lookup-panel-head">
                <h3 id="lookup-needs-title">Dependencies &amp; conflicts</h3>
                <span>{lookup.dependencies.length}</span>
              </div>
              {lookup.source === "unknown" ? (
                <p className="lookup-empty">
                  Dependency metadata is unknown. Link this mod to Modrinth,
                  import its JAR, or enter exact mod IDs.
                </p>
              ) : lookup.dependencies.length ? (
                <ul>
                  {lookup.dependencies.map((entry) => (
                    <DependencyRow
                      key={entry.key}
                      entry={entry}
                      onOpenMod={onOpenMod}
                    />
                  ))}
                </ul>
              ) : (
                <p className="lookup-empty">
                  {sourceText(lookup.source)} lists no dependencies.
                </p>
              )}
            </section>
            <section
              className="lookup-panel"
              aria-labelledby="lookup-used-by-title"
            >
              <div className="lookup-panel-head">
                <h3 id="lookup-used-by-title">Used by</h3>
                <span>{lookup.usedBy.length}</span>
              </div>
              {lookup.usedBy.length ? (
                <ul>
                  {lookup.usedBy.map(({ mod, entry }) => (
                    <li key={`${mod.id}:${entry.key}`} className="lookup-row">
                      <span className="compat-badge compat-compatible">
                        {relationLabels[entry.relation]}
                      </span>
                      <div>
                        <button
                          type="button"
                          className="plan-mod-open"
                          onClick={() => onOpenMod(mod)}
                        >
                          {mod.name}
                        </button>
                        <p>
                          From {sourceText(entry.source)}
                          {entry.linked ? " · Confirmed link" : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="lookup-empty">
                  No mod in this collection lists it as a dependency. Mods with
                  unknown metadata may still need it.
                </p>
              )}
            </section>
          </div>
        </>
      ) : (
        <div className="lookup-start">
          <GitBranch size={22} aria-hidden="true" />
          <p>Choose a mod to trace its dependencies in both directions.</p>
        </div>
      )}
    </div>
  );
}
