import { useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Info,
  LoaderCircle,
  PencilLine,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { CompatBadge, CompatReasons } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import { Select } from "../../components/ui/select";
import {
  checkCompatibility,
  findByProject,
  statusLabel,
} from "../../lib/compatibility";
import { modrinth, type ModrinthError } from "../../lib/modrinth/api";
import {
  loaderLabels,
  mergeModrinthIntoMod,
  modFromModrinth,
  normalizeLoader,
  projectFromHit,
  projectFromResponse,
  type ModrinthProject,
} from "../../lib/modrinth/mapping";
import { describeChanges } from "../../lib/modChanges";
import {
  cachedProjectVersions,
  resolveDependencies,
} from "../../lib/modrinth/service";
import { pickLatest } from "../../lib/updates";
import {
  filterVersions,
  loaderLabel,
  packMismatches,
  sortMinecraftVersions,
  versionFilterOptions,
  type VersionFilter,
} from "../../lib/modrinth/versionFilters";
import type { Mod, Modpack } from "../../lib/schema";
import { useModrinthRequest } from "./useModrinthRequest";

export type PickerTarget =
  { kind: "add" } | { kind: "refresh"; mod: Mod; preselectVersionId?: string };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? dateFormat.format(parsed) : null;
};

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

function RequestError({
  error,
  onRetry,
}: {
  error: ModrinthError;
  onRetry: () => void;
}) {
  return (
    <div className="inline-message error" role="alert">
      <Info size={16} aria-hidden="true" />
      <span>{error.message}</span>
      <Button
        variant="secondary"
        size="small"
        className="inline-message-action"
        onClick={onRetry}
      >
        <RotateCcw size={14} /> Retry
      </Button>
    </div>
  );
}

function LoadingRows({ label }: { label: string }) {
  return (
    <div className="mr-loading" role="status">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <div className="mr-skeleton" key={row} aria-hidden="true" />
      ))}
    </div>
  );
}

export function ModrinthPicker({
  target,
  mods,
  modpack,
  onPick,
  onManual,
  onCancel,
}: {
  target: PickerTarget;
  mods: Mod[];
  modpack: Modpack;
  onPick: (mod: Mod) => void;
  onManual: () => void;
  onCancel: () => void;
}) {
  const loader = normalizeLoader(modpack.modloader);
  const minecraft = modpack.minecraftVersion.trim();
  const existing = target.kind === "refresh" ? target.mod : null;
  const linkedProjectId = existing?.modrinth?.projectId ?? null;
  const packFilters = {
    gameVersion: minecraft || undefined,
    loader: loader ?? undefined,
  };
  const packLabel = [
    minecraft ? `Minecraft ${minecraft}` : null,
    loader ? loaderLabels[loader] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const [query, setQuery] = useState(
    existing && !linkedProjectId ? existing.name : "",
  );
  const [matchPack, setMatchPack] = useState(true);
  const [limit, setLimit] = useState(20);
  const [browsing, setBrowsing] = useState(false);
  const [picked, setPicked] = useState<ModrinthProject | null>(null);
  const packFilter: VersionFilter = {
    gameVersion: minecraft,
    loader: loader ?? "",
    showAll: false,
  };
  const [filter, setFilter] = useState<VersionFilter>(packFilter);
  const filterId = useId();
  const [versionLimit, setVersionLimit] = useState(30);
  const [versionId, setVersionId] = useState<string | null>(
    target.kind === "refresh" ? (target.preselectVersionId ?? null) : null,
  );

  const linked = useModrinthRequest(
    linkedProjectId && !browsing && !picked
      ? `project:${linkedProjectId}`
      : null,
    (signal) =>
      modrinth.project(linkedProjectId ?? "", signal).then(projectFromResponse),
  );
  const project = picked ?? (browsing ? null : (linked.data ?? null));

  const searchQuery = query.trim();
  const searchFilters = matchPack ? packFilters : {};
  const search = useModrinthRequest(
    searchQuery
      ? JSON.stringify({ searchQuery, ...searchFilters, limit })
      : null,
    (signal) =>
      modrinth.search({ query: searchQuery, ...searchFilters, limit }, signal),
    350,
  );

  const searchData =
    search.data ?? (search.loading ? search.latest : undefined);

  // The full list is fetched once (and cached) so filters, including "Show all versions",
  // work locally without new requests.
  const versions = useModrinthRequest(
    project ? `versions:${project.id}` : null,
    (signal) =>
      // Shared cache with the update checker; the signal only stops this view from waiting.
      Promise.race([
        cachedProjectVersions(modrinth, project?.id ?? ""),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
      ]),
  );
  const allFetched = useMemo(() => versions.data ?? [], [versions.data]);
  const matching = useMemo(
    () => filterVersions(allFetched, filter),
    [allFetched, filter],
  );
  const filterOptions = useMemo(
    () =>
      versionFilterOptions(allFetched, {
        gameVersion: minecraft || undefined,
        loader: loader ?? undefined,
      }),
    [allFetched, minecraft, loader],
  );
  const currentVersionId = existing?.modrinth?.versionId;
  // "Latest" always refers to the pack's own settings, whatever the filters show.
  const latestId = pickLatest(
    filterVersions(allFetched, packFilter),
    allFetched.find((version) => version.id === currentVersionId)
      ?.versionType ?? existing?.modrinth?.versionType,
  ).latest?.id;
  // A selection hidden by the filters counts as no selection.
  const selectedVersion =
    matching.find((version) => version.id === versionId) ?? null;
  const filtersDiffer =
    !filter.showAll &&
    (filter.gameVersion !== packFilter.gameVersion ||
      filter.loader !== packFilter.loader);
  const updateFilter = (next: Partial<VersionFilter>) => {
    const merged = { ...filter, ...next };
    setFilter(merged);
    if (
      versionId &&
      !filterVersions(allFetched, merged).some(
        (version) => version.id === versionId,
      )
    )
      setVersionId(null);
  };
  const details = useModrinthRequest(
    selectedVersion ? `deps:${selectedVersion.id}` : null,
    (signal) =>
      selectedVersion
        ? resolveDependencies(modrinth, selectedVersion, signal)
        : Promise.reject(new Error("No version selected")),
  );

  const others = useMemo(
    () => mods.filter((mod) => mod.id !== existing?.id),
    [mods, existing],
  );
  const candidate = useMemo(() => {
    if (!project || !details.data) return null;
    const fresh = modFromModrinth(project, details.data, others);
    return existing ? mergeModrinthIntoMod(existing, fresh) : fresh;
  }, [project, details.data, others, existing]);
  const compat = candidate
    ? checkCompatibility([...others, candidate], modpack).get(candidate.id)
    : undefined;
  const duplicate = project ? findByProject(others, project.id) : undefined;

  const openProject = (next: ModrinthProject) => {
    setPicked(next);
    setVersionId(null);
    setVersionLimit(30);
  };
  const backToSearch = () => {
    setPicked(null);
    setBrowsing(true);
    setVersionId(null);
  };

  const filterNote = !packLabel
    ? "Set the pack's Minecraft version and modloader in Pack settings to filter by them."
    : !loader && modpack.modloader.trim()
      ? `“${modpack.modloader}” is not a Modrinth loader, so only the Minecraft version is filtered.`
      : null;

  if (!project && linked.loading)
    return <LoadingRows label="Loading the linked Modrinth project…" />;

  if (!project)
    return (
      <div className="mr-picker">
        {linked.error && (
          <RequestError error={linked.error} onRetry={linked.retry} />
        )}
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search Modrinth</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(20);
            }}
            placeholder="Search Modrinth mods by name..."
            enterKeyHint="search"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
        <div className="mr-toolbar">
          {packLabel && (
            <label className="mr-check">
              <input
                type="checkbox"
                checked={matchPack}
                onChange={(event) => {
                  setMatchPack(event.target.checked);
                  setLimit(20);
                }}
              />
              Only show mods listed for {packLabel}
            </label>
          )}
          <span className="mr-hint">
            Search results are not a compatibility guarantee. The version you
            pick is checked next.
          </span>
          {filterNote && <span className="mr-hint">{filterNote}</span>}
        </div>
        <div className="mr-results" aria-busy={search.loading}>
          {!searchQuery ? (
            <div className="mr-empty">
              <Search size={22} aria-hidden="true" />
              <p>Type a mod name to search Modrinth.</p>
            </div>
          ) : search.loading && !searchData ? (
            <LoadingRows label="Searching Modrinth…" />
          ) : search.error ? (
            <RequestError error={search.error} onRetry={search.retry} />
          ) : !searchData?.hits.length ? (
            <div className="mr-empty">
              <Search size={22} aria-hidden="true" />
              <p>
                No mods found for “{searchQuery}”
                {matchPack && packLabel ? ` on ${packLabel}` : ""}.
              </p>
              {matchPack && packLabel && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setMatchPack(false)}
                >
                  Search all versions
                </Button>
              )}
            </div>
          ) : (
            <>
              <ul className="mr-list" aria-label="Modrinth results">
                {searchData.hits.map((hit) => {
                  const result = projectFromHit(hit);
                  const inPack = findByProject(others, result.id);
                  return (
                    <li key={result.id}>
                      <button
                        type="button"
                        className="mr-result"
                        onClick={() => openProject(result)}
                      >
                        <ModArtwork
                          name={result.title}
                          imageUrl={result.iconUrl}
                        />
                        <span className="mr-result-main">
                          <span className="mr-result-title">
                            <strong>{result.title}</strong>
                            {inPack && <span className="mr-chip">In pack</span>}
                          </span>
                          <span className="mr-result-meta">
                            {result.author && <>by {result.author} · </>}
                            {compactNumber.format(hit.downloads)} downloads
                          </span>
                          <span className="mr-result-desc">
                            {result.description}
                          </span>
                        </span>
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {searchData.hits.length < searchData.total_hits &&
                limit < 100 && (
                  <Button
                    variant="ghost"
                    size="small"
                    className="mr-more"
                    disabled={search.loading}
                    onClick={() => setLimit((value) => value + 20)}
                  >
                    {search.loading ? (
                      <LoaderCircle className="spin" size={14} />
                    ) : null}
                    Show more results
                  </Button>
                )}
            </>
          )}
        </div>
        <div className="dialog-actions">
          {target.kind === "add" && (
            <Button variant="ghost" className="mr-manual" onClick={onManual}>
              <PencilLine size={15} /> Enter details manually
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );

  const shownVersions = matching.slice(0, versionLimit);
  const mismatches = selectedVersion
    ? packMismatches(selectedVersion, packFilters)
    : [];
  return (
    <div className="mr-picker">
      <div className="mr-project">
        <ModArtwork name={project.title} imageUrl={project.iconUrl} large />
        <div className="mr-project-main">
          <h3>{project.title}</h3>
          <p>
            {project.author && <>by {project.author} · </>}
            <a href={project.sourceUrl} target="_blank" rel="noreferrer">
              View on Modrinth <ArrowUpRight size={13} />
            </a>
          </p>
          <p className="mr-result-desc">{project.description}</p>
        </div>
        <Button variant="ghost" size="small" onClick={backToSearch}>
          <ArrowLeft size={15} /> {linkedProjectId ? "Search" : "Back"}
        </Button>
      </div>
      {duplicate && (
        <div className="inline-message error" role="alert">
          <Info size={16} aria-hidden="true" />
          <span>
            This project is already in the pack as “{duplicate.name}”. Update
            that mod instead of adding it again.
          </span>
        </div>
      )}
      <fieldset className="mr-versions">
        <legend>Choose a version</legend>
        <div className="mr-filters">
          <div className="mr-filter">
            <span id={`${filterId}-game`}>Game version</span>
            <Combobox
              aria-labelledby={`${filterId}-game`}
              size="sm"
              disabled={filter.showAll}
              value={filter.gameVersion}
              onValueChange={(value) => updateFilter({ gameVersion: value })}
              searchPlaceholder="Search versions…"
              emptyText="No game versions match."
              options={[
                { value: "", label: "Any version" },
                ...filterOptions.gameVersions.map((value) => ({
                  value,
                  label: value === minecraft ? `${value} (pack)` : value,
                })),
              ]}
            />
          </div>
          <div className="mr-filter">
            <span id={`${filterId}-loader`}>Modloader</span>
            <Select
              aria-labelledby={`${filterId}-loader`}
              size="sm"
              disabled={filter.showAll}
              value={filter.loader}
              onValueChange={(value) => updateFilter({ loader: value })}
              options={[
                { value: "", label: "Any loader" },
                ...filterOptions.loaders.map((value) => ({
                  value,
                  label:
                    value === loader
                      ? `${loaderLabel(value)} (pack)`
                      : loaderLabel(value),
                })),
              ]}
            />
          </div>
          <label className="mr-check">
            <input
              type="checkbox"
              checked={filter.showAll}
              onChange={(event) =>
                updateFilter({ showAll: event.target.checked })
              }
            />
            Show all versions
          </label>
        </div>
        {versions.data && (
          <p className="mr-hint mr-filter-count" role="status">
            {matching.length} of {allFetched.length}{" "}
            {allFetched.length === 1 ? "version" : "versions"}
            {filter.showAll ? " (filters off)" : ""}
          </p>
        )}
        {filtersDiffer && packLabel && (
          <p className="mr-hint mr-filter-note">
            <Info size={14} aria-hidden="true" />
            Filters differ from Pack settings ({packLabel}). Listed versions are
            not checked against the pack until you pick one.
            <button
              type="button"
              className="filter-reset"
              onClick={() => updateFilter(packFilter)}
            >
              <RotateCcw size={13} aria-hidden="true" /> Use pack settings
            </button>
          </p>
        )}
        {versions.loading ? (
          <LoadingRows label="Loading versions…" />
        ) : versions.error ? (
          <RequestError error={versions.error} onRetry={versions.retry} />
        ) : !allFetched.length ? (
          <div className="mr-empty">
            <p>This project has no published versions.</p>
          </div>
        ) : !shownVersions.length ? (
          <div className="mr-empty">
            <p>
              No versions are listed for{" "}
              {[
                filter.gameVersion
                  ? `Minecraft ${filter.gameVersion}`
                  : "any Minecraft version",
                filter.loader ? loaderLabel(filter.loader) : "any loader",
              ].join(" with ")}
              .
            </p>
            <div className="mr-empty-actions">
              {filtersDiffer && (
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => updateFilter(packFilter)}
                >
                  Use pack settings
                </Button>
              )}
              <Button
                variant="secondary"
                size="small"
                onClick={() => updateFilter({ showAll: true })}
              >
                Show all versions
              </Button>
            </div>
          </div>
        ) : (
          <div className="mr-version-list">
            {shownVersions.map((version) => (
              <label
                key={version.id}
                className={
                  version.id === versionId
                    ? "mr-version selected"
                    : "mr-version"
                }
              >
                <input
                  type="radio"
                  name="modrinth-version"
                  checked={version.id === versionId}
                  onChange={() => setVersionId(version.id)}
                />
                <span className="mr-version-main">
                  <span className="mr-version-title">
                    <strong>{version.versionNumber}</strong>
                    {version.id === currentVersionId && (
                      <span className="mr-chip mr-chip-muted">Current</span>
                    )}
                    {version.id === latestId && (
                      <span className="mr-chip">Latest for pack</span>
                    )}
                  </span>
                  <span>
                    {formatDate(version.datePublished) ?? "Date unknown"} ·{" "}
                    {version.loaders.map(loaderLabel).join(", ")} · MC{" "}
                    {sortMinecraftVersions(version.gameVersions)
                      .slice(0, 3)
                      .join(", ")}
                    {version.gameVersions.length > 3 ? " …" : ""}
                  </span>
                </span>
                <span
                  className={
                    version.versionType === "release"
                      ? "mr-chip mr-chip-muted"
                      : "mr-chip mr-chip-warn"
                  }
                >
                  {version.versionType}
                </span>
              </label>
            ))}
            {matching.length > versionLimit && (
              <Button
                variant="ghost"
                size="small"
                className="mr-more"
                onClick={() => setVersionLimit((value) => value + 30)}
              >
                Show more versions
              </Button>
            )}
          </div>
        )}
      </fieldset>
      {selectedVersion && (
        <section className="mr-compat" aria-live="polite">
          <h4>Compatibility with this pack</h4>
          {mismatches.length > 0 && (
            <p className="jar-warning">
              <Info size={13} aria-hidden="true" />
              This version is not listed for {mismatches.join(" or ")} from Pack
              settings.
            </p>
          )}
          {details.loading ? (
            <p className="mr-hint">
              <LoaderCircle className="spin" size={14} aria-hidden="true" />{" "}
              Checking dependencies…
            </p>
          ) : details.error ? (
            <RequestError error={details.error} onRetry={details.retry} />
          ) : compat ? (
            <>
              <CompatBadge status={compat.status} label={statusLabel(compat)} />
              <CompatReasons result={compat} />
            </>
          ) : candidate ? (
            <p className="mr-hint">
              Not checked because this mod is {candidate.status}.
            </p>
          ) : null}
        </section>
      )}
      {existing && candidate && (
        <section className="mr-compat" aria-live="polite">
          <h4>Changes to “{existing.name}”</h4>
          {(() => {
            const changes = describeChanges(existing, candidate);
            return changes.length ? (
              <ul className="jar-update-changes">
                {changes.map((change) => (
                  <li key={change.field}>
                    <strong>{change.label}</strong>:{" "}
                    {change.overwrites
                      ? `replaces “${change.from}” with “${change.to}”`
                      : `fills in “${change.to}”`}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mr-hint">Nothing would change.</p>
            );
          })()}
          <p className="mr-hint">
            The ID, name, status, notes, and batch assignments stay the same.
            You can review everything again before saving.
          </p>
        </section>
      )}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!candidate || Boolean(duplicate)}
          onClick={() => candidate && onPick(candidate)}
        >
          {existing ? "Review update" : "Review details"}{" "}
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
