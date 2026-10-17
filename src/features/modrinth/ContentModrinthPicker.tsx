import { useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CircleCheck,
  CircleHelp,
  CircleX,
  Info,
  LoaderCircle,
  PackagePlus,
  Search,
  X,
} from "lucide-react";
import { CompatBadge } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import type { CheckState } from "../../lib/compatibility";
import { contentMeta } from "../../lib/content";
import { modrinth } from "../../lib/modrinth/api";
import {
  contentCompatibility,
  contentItemFromModrinth,
  contentSearch,
  contentVersions,
  filterContentVersions,
  findContentDuplicate,
} from "../../lib/modrinth/contentImport";
import {
  projectFromHit,
  projectUrl,
  type ModrinthProject,
} from "../../lib/modrinth/mapping";
import { cachedProjectVersions } from "../../lib/modrinth/service";
import {
  loaderLabel,
  sortMinecraftVersions,
  versionFilterOptions,
} from "../../lib/modrinth/versionFilters";
import {
  contentCollections,
  type ContentItem,
  type ContentKey,
  type Modpack,
} from "../../lib/schema";
import { LoadingRows, RequestError } from "./ModrinthPicker";
import { useModrinthRequest } from "./useModrinthRequest";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const formatDate = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? dateFormat.format(parsed) : null;
};
const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

const checkIcons: Record<CheckState, typeof CircleCheck> = {
  pass: CircleCheck,
  warn: CircleHelp,
  fail: CircleX,
  unknown: CircleHelp,
};
const checkClass: Record<CheckState, string> = {
  pass: "compatible",
  warn: "warning",
  fail: "incompatible",
  unknown: "unknown",
};
const checkText: Record<CheckState, string> = {
  pass: "OK",
  warn: "Check",
  fail: "Problem",
  unknown: "Unknown",
};

/**
 * Modrinth search and import for resource packs, data packs, and shaders. The content type comes
 * from the collection it was opened from and never changes, so an entry can only land there.
 */
export function ContentModrinthPicker({
  contentKey,
  items,
  modpack,
  onAdd,
  onOpenExisting,
  onCancel,
}: {
  contentKey: ContentKey;
  /** The destination collection, for duplicate checks and unique IDs. */
  items: ContentItem[];
  modpack: Modpack;
  /** Adds the entry to the draft; returns false when nothing was added. */
  onAdd: (item: ContentItem) => boolean;
  onOpenExisting: (item: ContentItem) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const { type } = contentCollections[contentKey];
  const meta = contentMeta[contentKey];
  const minecraft = modpack.minecraftVersion.trim();
  const { projectType } = contentSearch[type];

  const [query, setQuery] = useState("");
  const [matchPack, setMatchPack] = useState(true);
  const [limit, setLimit] = useState(20);
  const [project, setProject] = useState<ModrinthProject | null>(null);
  const [gameVersion, setGameVersion] = useState(minecraft);
  const [showAll, setShowAll] = useState(false);
  const [versionLimit, setVersionLimit] = useState(30);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [adding, setAdding] = useState(false);

  const searchQuery = query.trim();
  const gameFilter = matchPack && minecraft ? minecraft : undefined;
  const search = useModrinthRequest(
    searchQuery
      ? JSON.stringify({ searchQuery, projectType, gameFilter, limit })
      : null,
    (signal) =>
      modrinth.search(
        { query: searchQuery, projectType, gameVersion: gameFilter, limit },
        signal,
      ),
    350,
  );
  const searchData =
    search.data ?? (search.loading ? search.latest : undefined);

  const versions = useModrinthRequest(
    project ? `versions:${project.id}` : null,
    (signal) =>
      // Shared five-minute cache with the mod picker and update checker.
      Promise.race([
        cachedProjectVersions(modrinth, project?.id ?? ""),
        new Promise<never>((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
      ]),
  );
  const ofType = useMemo(
    () => contentVersions(versions.data ?? [], type),
    [versions.data, type],
  );
  const matching = useMemo(
    () =>
      filterContentVersions(versions.data ?? [], type, {
        gameVersion,
        showAll,
      }),
    [versions.data, type, gameVersion, showAll],
  );
  const gameVersions = useMemo(
    () =>
      versionFilterOptions(ofType, { gameVersion: minecraft || undefined })
        .gameVersions,
    [ofType, minecraft],
  );
  // A selection hidden by the filters counts as no selection.
  const selected = matching.find((version) => version.id === versionId) ?? null;
  const compat = selected
    ? contentCompatibility(selected, type, minecraft)
    : null;
  const duplicate = project ? findContentDuplicate(items, project) : undefined;
  const blocked = duplicate && duplicate.match !== "name";

  const openProject = (next: ModrinthProject) => {
    setProject(next);
    setVersionId(null);
    setVersionLimit(30);
    setReviewing(false);
  };
  const backToSearch = () => {
    setProject(null);
    setVersionId(null);
    setReviewing(false);
  };

  if (!project)
    return (
      <div className="mr-picker">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search Modrinth {meta.title}</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(20);
            }}
            placeholder={`Search Modrinth ${meta.title.toLowerCase()} by name...`}
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
          {minecraft && (
            <label className="mr-check">
              <input
                type="checkbox"
                checked={matchPack}
                onChange={(event) => {
                  setMatchPack(event.target.checked);
                  setLimit(20);
                }}
              />
              Only show {meta.title.toLowerCase()} listed for Minecraft{" "}
              {minecraft}
            </label>
          )}
          <span className="mr-hint">
            Results are {meta.title.toLowerCase()} only. The version you pick is
            checked next.
          </span>
        </div>
        <div className="mr-results" aria-busy={search.loading}>
          {!searchQuery ? (
            <div className="mr-empty">
              <Search size={22} aria-hidden="true" />
              <p>Type a name to search Modrinth {meta.title.toLowerCase()}.</p>
            </div>
          ) : search.loading && !searchData ? (
            <LoadingRows label="Searching Modrinth…" />
          ) : search.error ? (
            <RequestError error={search.error} onRetry={search.retry} />
          ) : !searchData?.hits.length ? (
            <div className="mr-empty">
              <Search size={22} aria-hidden="true" />
              <p>
                No {meta.title.toLowerCase()} found for “{searchQuery}”
                {gameFilter ? ` on Minecraft ${gameFilter}` : ""}.
              </p>
              {gameFilter && (
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
                  const result = {
                    ...projectFromHit(hit),
                    sourceUrl: projectUrl(hit.slug, type),
                  };
                  const inCollection = findContentDuplicate(items, result);
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
                            {inCollection && inCollection.match !== "name" && (
                              <span className="mr-chip">In collection</span>
                            )}
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
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );

  if (reviewing && selected && compat) {
    const item = contentItemFromModrinth(project, selected, type, items);
    const required = selected.dependencies.filter(
      (dependency) => dependency.type === "required",
    );
    return (
      <div className="mr-picker">
        <section className="mr-compat" aria-labelledby={`${id}-review`}>
          <h4 id={`${id}-review`}>Review before adding</h4>
          <dl className="content-review">
            <div>
              <dt>Destination</dt>
              <dd>{meta.title}</dd>
            </div>
            <div>
              <dt>Project</dt>
              <dd>
                {project.title}{" "}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                  View on Modrinth <ArrowUpRight size={12} />
                </a>
              </dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>
                {selected.versionNumber} · {selected.versionType}
                {formatDate(selected.datePublished)
                  ? ` · ${formatDate(selected.datePublished)}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Minecraft</dt>
              <dd>
                {sortMinecraftVersions(selected.gameVersions).join(", ") ||
                  "Not listed"}
              </dd>
            </div>
            {type === "shader" && (
              <div>
                <dt>Shader runtimes</dt>
                <dd>
                  {selected.loaders.map(loaderLabel).join(", ") || "Not listed"}{" "}
                  (not checked)
                </dd>
              </div>
            )}
            {required.length > 0 && (
              <div>
                <dt>Dependencies</dt>
                <dd>
                  {required
                    .map(
                      (dependency) =>
                        dependency.name ??
                        dependency.projectId ??
                        dependency.versionId,
                    )
                    .join(", ")}{" "}
                  (kept, not checked or added)
                </dd>
              </div>
            )}
            <div>
              <dt>Source</dt>
              <dd>Modrinth · added as Planned</dd>
            </div>
          </dl>
          <CompatBadge status={compat.status} />
          {compat.reasons.map((reason) => (
            <p
              key={reason.message}
              className={reason.level === "error" ? "jar-warning" : "jar-note"}
            >
              <Info size={13} aria-hidden="true" />
              {reason.message}
            </p>
          ))}
        </section>
        <div className="dialog-actions">
          <Button
            variant="ghost"
            className="mr-manual"
            onClick={() => setReviewing(false)}
          >
            <ArrowLeft size={15} /> Back
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={adding || Boolean(blocked)}
            onClick={() => {
              setAdding(true);
              if (!onAdd(item)) setAdding(false);
            }}
          >
            <PackagePlus size={16} /> Add to {meta.title.toLowerCase()}
          </Button>
        </div>
      </div>
    );
  }

  const shownVersions = matching.slice(0, versionLimit);
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
          <ArrowLeft size={15} /> Back
        </Button>
      </div>
      {duplicate && (
        <div
          className={blocked ? "inline-message error" : "inline-message"}
          role={blocked ? "alert" : "status"}
        >
          <Info size={16} aria-hidden="true" />
          <span>
            {blocked
              ? `This project is already in ${meta.title.toLowerCase()} as “${duplicate.item.name}”.`
              : `“${duplicate.item.name}” in ${meta.title.toLowerCase()} has the same name. Check it is not the same project.`}
          </span>
          <Button
            variant="secondary"
            size="small"
            className="inline-message-action"
            onClick={() => onOpenExisting(duplicate.item)}
          >
            Review existing
          </Button>
        </div>
      )}
      <fieldset className="mr-versions">
        <legend>Choose a version</legend>
        <div className="mr-filters">
          <div className="mr-filter">
            <span id={`${id}-game`}>Game version</span>
            <Combobox
              aria-labelledby={`${id}-game`}
              size="sm"
              disabled={showAll}
              value={gameVersion}
              onValueChange={(value) => {
                setGameVersion(value);
                setVersionId(null);
              }}
              searchPlaceholder="Search versions…"
              emptyText="No game versions match."
              options={[
                { value: "", label: "Any version" },
                ...gameVersions.map((value) => ({
                  value,
                  label: value === minecraft ? `${value} (pack)` : value,
                })),
              ]}
            />
          </div>
          <label className="mr-check">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => {
                setShowAll(event.target.checked);
                setVersionId(null);
              }}
            />
            Show all versions
          </label>
        </div>
        {versions.data && (
          <p className="mr-hint mr-filter-count" role="status">
            {matching.length} of {ofType.length}{" "}
            {ofType.length === 1 ? "version" : "versions"}
            {type === "datapack" ? " published as data packs" : ""}
          </p>
        )}
        {versions.loading ? (
          <LoadingRows label="Loading versions…" />
        ) : versions.error ? (
          <RequestError error={versions.error} onRetry={versions.retry} />
        ) : !ofType.length ? (
          <div className="mr-empty">
            <p>
              {type === "datapack"
                ? "This project has no versions published as a data pack."
                : "This project has no published versions."}
            </p>
          </div>
        ) : !shownVersions.length ? (
          <div className="mr-empty">
            <p>
              No versions are listed for{" "}
              {gameVersion ? `Minecraft ${gameVersion}` : "any version"}.
            </p>
            <div className="mr-empty-actions">
              <Button
                variant="secondary"
                size="small"
                onClick={() => setShowAll(true)}
              >
                Show all versions
              </Button>
            </div>
          </div>
        ) : (
          <div className="mr-version-list">
            {shownVersions.map((version) => {
              const fits = minecraft
                ? version.gameVersions.includes(minecraft)
                : null;
              return (
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
                    name={`${id}-version`}
                    checked={version.id === versionId}
                    onChange={() => setVersionId(version.id)}
                  />
                  <span className="mr-version-main">
                    <span className="mr-version-title">
                      <strong>{version.versionNumber}</strong>
                      {fits === false && (
                        <span className="mr-chip mr-chip-warn">
                          Not for {minecraft}
                        </span>
                      )}
                    </span>
                    <span>
                      {formatDate(version.datePublished) ?? "Date unknown"} · MC{" "}
                      {sortMinecraftVersions(version.gameVersions)
                        .slice(0, 3)
                        .join(", ") || "not listed"}
                      {version.gameVersions.length > 3 ? " …" : ""}
                      {type === "shader" && version.loaders.length
                        ? ` · ${version.loaders.map(loaderLabel).join(", ")}`
                        : ""}
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
              );
            })}
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
      {selected && compat && (
        <section className="mr-compat" aria-live="polite">
          <h4>Compatibility with this pack</h4>
          <CompatBadge status={compat.status} />
          <ul className="compat-checks content-checks" aria-label="Checks">
            {(
              [
                ["minecraft", "Minecraft version"],
                ["runtime", "Shader runtime"],
                ["dependencies", "Dependencies"],
              ] as const
            ).flatMap(([key, label]) => {
              const state = compat.checks[key];
              if (!state) return [];
              const Icon = checkIcons[state];
              return [
                <li
                  key={key}
                  className={`compat-badge compat-${checkClass[state]}`}
                >
                  <Icon size={12} aria-hidden="true" />
                  {label}: {checkText[state]}
                </li>,
              ];
            })}
          </ul>
          {compat.reasons.map((reason) => (
            <p
              key={reason.message}
              className={reason.level === "error" ? "jar-warning" : "jar-note"}
            >
              <Info size={13} aria-hidden="true" />
              {reason.message}
            </p>
          ))}
          <p className="mr-hint">
            No modloader is needed for {meta.title.toLowerCase()}.
          </p>
        </section>
      )}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!selected || Boolean(blocked)}
          onClick={() => setReviewing(true)}
        >
          Review details <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
