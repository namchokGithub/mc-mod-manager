import { useId, useState } from "react";
import { ArrowUpRight, Box, Search, X } from "lucide-react";
import { CompatBadge } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import {
  contentItemCompat,
  contentSourceText,
  contentStatusLabel,
  contentVerificationText,
} from "../../lib/contentVerification";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/ui/select";
import {
  contentMeta,
  contentSourceLabels,
  contentStatusLabels,
  initialContentQuery,
  queryContent,
  type ContentQuery,
} from "../../lib/content";
import {
  DEFAULT_PAGE_SIZE,
  paginate,
  type PageSize,
} from "../../lib/pagination";
import {
  contentCollections,
  contentKeys,
  contentStatuses,
  type Collection,
  type ContentItem,
  type ContentKey,
} from "../../lib/schema";

/** Read-only browser for resource packs, data packs, and shaders on the public page. */
export function ContentPreview({ data }: { data: Collection }) {
  const id = useId();
  const [active, setActive] = useState<ContentKey>(
    () => contentKeys.find((key) => data[key].items.length) ?? "resourcePacks",
  );
  const [query, setQuery] = useState<ContentQuery>(initialContentQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const meta = contentMeta[active];
  const type = contentCollections[active].type;
  const compatOf = (item: ContentItem) =>
    contentItemCompat(item, type, data.modpack.minecraftVersion);
  const items = data[active].items;
  const shown = queryContent(items, query);
  const paged = paginate(shown, page, pageSize);
  const changeQuery = (next: Partial<ContentQuery>) => {
    setQuery((current) => ({ ...current, ...next }));
    setPage(1);
  };

  return (
    <section id="more-content" className="collection-section content-preview">
      <div className="section-heading">
        <div>
          <div className="section-kicker">BEYOND THE MODS</div>
          <h2>
            More for this world<span className="heading-period">.</span>
          </h2>
          <p>Resource packs, data packs, and shaders planned for the pack.</p>
        </div>
      </div>
      <div className="content-tabs" role="tablist" aria-label="Content type">
        {contentKeys.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${id}-${key}`}
            aria-selected={key === active}
            aria-controls={`${id}-panel`}
            className={key === active ? "content-tab active" : "content-tab"}
            onClick={() => {
              setActive(key);
              setQuery(initialContentQuery);
              setPage(1);
            }}>
            {contentMeta[key].title} <span>{data[key].items.length}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${active}`}>
        <p className="content-description">{meta.description}</p>
        {items.length > 0 && (
          <div className="filters-panel">
            <div className="filters-top">
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">
                  Search {meta.title.toLowerCase()}
                </span>
                <input
                  value={query.query}
                  placeholder="Search by name..."
                  autoComplete="off"
                  onChange={(event) =>
                    changeQuery({ query: event.target.value })
                  }
                />
                {query.query && (
                  <button
                    type="button"
                    className="search-clear"
                    aria-label="Clear search"
                    onClick={() => changeQuery({ query: "" })}>
                    <X size={15} />
                  </button>
                )}
              </label>
            </div>
            <div className="filters-bottom">
              <Select
                aria-label="Status"
                size="sm"
                variant="compact"
                className="filter-select"
                active={Boolean(query.status)}
                value={query.status}
                onValueChange={(value) =>
                  changeQuery({ status: value as ContentQuery["status"] })
                }
                options={[
                  { value: "", label: "All statuses" },
                  ...contentStatuses.map((value) => ({
                    value,
                    label: contentStatusLabels[value],
                  })),
                ]}
              />
              <Select
                aria-label="Sort order"
                size="sm"
                variant="compact"
                className="filter-select"
                value={query.sort}
                onValueChange={(value) =>
                  changeQuery({ sort: value as ContentQuery["sort"] })
                }
                options={[
                  { value: "name", label: "Name: A–Z" },
                  { value: "name-desc", label: "Name: Z–A" },
                  { value: "updated", label: "Recently updated" },
                  { value: "status", label: "Status" },
                ]}
              />
              <span className="result-count" role="status">
                {shown.length === items.length
                  ? `${items.length} total`
                  : `${shown.length} of ${items.length}`}
              </span>
            </div>
          </div>
        )}
        {!items.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Box size={26} />
            </div>
            <h3>No {meta.title.toLowerCase()} yet</h3>
            <p>Check back soon. They will appear here once published.</p>
          </div>
        ) : !shown.length ? (
          <p className="content-description">Nothing matches these filters.</p>
        ) : (
          <>
            <div className="mod-collection mod-grid">
              {paged.items.map((item) => {
                const compat = compatOf(item);
                return (
                  <article className="mod-card content-card" key={item.id}>
                    <div className="mod-card-top">
                      <ModArtwork name={item.name} imageUrl={item.imageUrl} />
                      <span className="card-badges">
                        <CompatBadge
                          status={compat.status}
                          label={contentStatusLabel(compat)}
                          source={contentVerificationText(compat)}
                          compact
                        />
                        <span className={`status status-${item.status}`}>
                          {contentStatusLabels[item.status]}
                        </span>
                      </span>
                    </div>
                    <div className="mod-card-body">
                      <span className="mod-category">
                        {contentSourceText(item, contentSourceLabels)}
                      </span>
                      <h3>{item.name}</h3>
                      <p>{item.description || "No description yet."}</p>
                      {item.tags.length > 0 && (
                        <p className="content-tags">{item.tags.join(" · ")}</p>
                      )}
                      <p className="content-tags">
                        {contentVerificationText(compat)}
                        {compat.evidence && (
                          <>
                            {" · "}
                            <a
                              href={compat.evidence?.evidenceUrl}
                              target="_blank"
                              rel="noreferrer">
                              {compat.verification === "manual-verified"
                                ? "Evidence"
                                : "Earlier evidence"}
                            </a>
                          </>
                        )}
                        {item.curseforge &&
                          item.curseforge.url !== item.sourceUrl && (
                            <>
                              {" · "}
                              <a
                                href={item.curseforge.url}
                                target="_blank"
                                rel="noreferrer">
                                CurseForge
                              </a>
                            </>
                          )}
                      </p>
                    </div>
                    <div className="mod-card-footer">
                      <span className="mod-card-meta">
                        {item.minecraftVersions.length
                          ? `MC ${item.minecraftVersions.join(", ")}`
                          : "Minecraft version not listed"}
                        {item.version && (
                          <span
                            className="mod-card-version"
                            title={item.version}>
                            {" "}
                            · v{item.version}
                          </span>
                        )}
                      </span>
                      {item.sourceUrl && (
                        <a
                          className="mod-card-cta"
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noreferrer">
                          Source <ArrowUpRight size={15} />
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            <Pagination
              label={`${meta.title} pages`}
              noun={{ one: meta.singular, many: meta.title.toLowerCase() }}
              page={paged}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        )}
      </div>
    </section>
  );
}
