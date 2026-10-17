import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Box,
  Pencil,
  Plus,
  Link2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { useToast } from "../../app/ToastContext";
import { ModArtwork } from "../../components/ModArtwork";
import { Pagination } from "../../components/Pagination";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import {
  addContentItem,
  contentMeta,
  contentSourceLabels,
  contentStatusLabels,
  deleteContentItem,
  emptyContentInput,
  initialContentQuery,
  inputFromItem,
  parseContentFile,
  queryContent,
  updateContentItem,
  type ContentInput,
  type ContentQuery,
} from "../../lib/content";
import {
  DEFAULT_PAGE_SIZE,
  paginate,
  type PageSize,
} from "../../lib/pagination";
import {
  contentCollections,
  contentStatuses,
  type ContentFile,
  type ContentItem,
  type ContentKey,
} from "../../lib/schema";
import { downloadJson } from "../../lib/storage";
import { useRetained } from "../../lib/useRetained";
import { ContentEditor } from "./ContentEditor";
import { ContentModrinthPicker } from "../modrinth/ContentModrinthPicker";
import { findContentDuplicate } from "../../lib/modrinth/contentImport";
import { CompatBadge } from "../../components/CompatBadge";
import { nameFromSlug } from "../../lib/curseforge";
import {
  contentItemCompat,
  contentSourceText,
  contentStatusLabel,
  contentVerificationText,
} from "../../lib/contentVerification";
import { CurseForgeLink } from "./CurseForgeLink";

/** Manage page for one additional collection: resource packs, data packs, or shaders. */
export function ContentPanel({ contentKey }: { contentKey: ContentKey }) {
  const { data, updateContent } = useCollection();
  const notify = useToast();
  const meta = contentMeta[contentKey];
  const { type, file: fileName } = contentCollections[contentKey];
  const file = data[contentKey];
  const items = file.items;

  const [query, setQuery] = useState<ContentQuery>(initialContentQuery);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  // `initial` holds prefilled values (from a CurseForge link or an attach action).
  const [editing, setEditing] = useState<{
    item: ContentItem | null;
    initial?: ContentInput;
  } | null>(null);
  const shownEditing = useRetained(editing);
  const [editorDirty, setEditorDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);
  const shownDeleting = useRetained(deleting);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    value: ContentFile;
  } | null>(null);
  const shownImport = useRetained(pendingImport);
  const fileRef = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(false);
  const [linking, setLinking] = useState(false);

  // Reloading or closing the browser tab would drop unsaved form edits.
  useEffect(() => {
    if (!editorDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editorDirty]);

  const shown = queryContent(items, query);
  const paged = paginate(shown, page, pageSize);
  const changeQuery = (next: Partial<ContentQuery>) => {
    setQuery((current) => ({ ...current, ...next }));
    setPage(1);
  };
  const versionSuggestions = [
    ...(data.modpack.minecraftVersion.trim()
      ? [data.modpack.minecraftVersion.trim()]
      : []),
    ...items.flatMap((item) => item.minecraftVersions),
  ];

  const save = (items: ContentItem[]) =>
    updateContent(contentKey, { version: 1, type, items });
  const submit = (input: ContentInput) => {
    const current = editing?.item;
    const result = current
      ? updateContentItem(items, current.id, input, new Date(), type)
      : addContentItem(items, input, new Date(), type);
    if (!result.ok) return result.errors;
    save(result.items);
    setEditing(null);
    notify({
      title: current
        ? `${result.item.name} updated`
        : `${result.item.name} added`,
      description: "Stored in this browser’s draft.",
    });
    return null;
  };
  // Checked again on confirm, so a project added meanwhile (e.g. in another tab) is not duplicated.
  const addFromModrinth = (item: ContentItem) => {
    const project = item.modrinth;
    const duplicate = project
      ? findContentDuplicate(items, {
          id: project.projectId,
          slug: project.slug ?? project.projectId,
          title: item.name,
        })
      : undefined;
    if (duplicate && duplicate.match !== "name") {
      notify({
        kind: "error",
        title: "Not added",
        description: `${meta.title} already has this project as “${duplicate.item.name}”.`,
      });
      return false;
    }
    try {
      save([...items, item]);
    } catch {
      notify({
        kind: "error",
        title: "Not added",
        description: "The entry did not pass validation. Nothing was changed.",
      });
      return false;
    }
    setPicking(false);
    notify({
      title: `${item.name} added to ${meta.title.toLowerCase()}`,
      description: "Planned, stored in this browser’s draft.",
    });
    return true;
  };
  const closeEditor = () =>
    editorDirty ? setConfirmDiscard(true) : setEditing(null);

  const onImportFile = async (picked?: File) => {
    if (!picked) return;
    try {
      setPendingImport({
        fileName: picked.name,
        value: parseContentFile(await picked.text(), contentKey),
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Import failed",
        description: `${picked.name}: ${error instanceof Error ? error.message : "Unreadable file."} Your current data was not changed.`,
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="content-panel">
      <div className="manage-section-head">
        <div>
          <h2>{meta.title}</h2>
          <p>{meta.description}</p>
        </div>
        <div className="section-head-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void onImportFile(event.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <ArrowUpFromLine size={16} /> Import
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              downloadJson(fileName, file);
              notify({
                kind: "info",
                title: `${fileName} exported`,
                description: "Replace the file in public/data/ to publish it.",
              });
            }}
          >
            <ArrowDownToLine size={16} /> Export
          </Button>
          <Button variant="secondary" onClick={() => setPicking(true)}>
            <Search size={16} /> Search Modrinth
          </Button>
          <Button variant="secondary" onClick={() => setLinking(true)}>
            <Link2 size={16} /> Add from CurseForge
          </Button>
          <Button onClick={() => setEditing({ item: null })}>
            <Plus size={17} /> Add {meta.singular}
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="filters-panel">
          <div className="filters-top">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search {meta.title.toLowerCase()}</span>
              <input
                value={query.query}
                placeholder="Search by name..."
                autoComplete="off"
                onChange={(event) => changeQuery({ query: event.target.value })}
              />
              {query.query && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => changeQuery({ query: "" })}
                >
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
            <Box size={24} />
          </div>
          <h3>No {meta.title.toLowerCase()} yet</h3>
          <p>Add one by hand or import a {fileName} file.</p>
          <Button onClick={() => setEditing({ item: null })}>
            <Plus size={17} /> Add {meta.singular}
          </Button>
        </div>
      ) : !shown.length ? (
        <p className="mr-hint">Nothing matches these filters.</p>
      ) : (
        <>
          <div className="manage-list">
            {paged.items.map((item) => {
              const compat = contentItemCompat(
                item,
                type,
                data.modpack.minecraftVersion,
              );
              return (
                <div className="manage-row" key={item.id}>
                  <ModArtwork name={item.name} imageUrl={item.imageUrl} />
                  <div className="manage-row-main">
                    <div>
                      <h3 title={item.name}>{item.name}</h3>
                      <span className={`status status-${item.status}`}>
                        {contentStatusLabels[item.status]}
                      </span>
                      <CompatBadge
                        status={compat.status}
                        label={contentStatusLabel(compat)}
                        source={contentVerificationText(compat)}
                        compact
                      />
                    </div>
                    <p>
                      {contentSourceText(item, contentSourceLabels)}
                      {item.version && (
                        <>
                          {" "}
                          <span>·</span> v{item.version}
                        </>
                      )}
                      {item.minecraftVersions.length > 0 && (
                        <>
                          {" "}
                          <span>·</span> MC {item.minecraftVersions.join(", ")}
                        </>
                      )}
                      {item.sourceUrl && (
                        <>
                          {" "}
                          <span>·</span>{" "}
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Source <ArrowUpRight size={12} />
                          </a>
                        </>
                      )}
                      {item.curseforge &&
                        item.curseforge.url !== item.sourceUrl && (
                          <>
                            {" "}
                            <span>·</span>{" "}
                            <a
                              href={item.curseforge.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              CurseForge <ArrowUpRight size={12} />
                            </a>
                          </>
                        )}
                    </p>
                  </div>
                  <div className="row-actions">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${item.name}`}
                      title="Edit"
                      onClick={() => setEditing({ item })}
                    >
                      <Pencil size={17} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="row-delete"
                      aria-label={`Delete ${item.name}`}
                      title="Delete"
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 size={17} />
                    </Button>
                  </div>
                </div>
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

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && closeEditor()}
        title={
          shownEditing?.item
            ? `Edit ${shownEditing.item.name}`
            : `Add ${meta.singular}`
        }
        size="wide"
      >
        {shownEditing && (
          <ContentEditor
            key={shownEditing.item?.id ?? "new"}
            initial={
              shownEditing.initial ??
              (shownEditing.item
                ? inputFromItem(shownEditing.item)
                : emptyContentInput())
            }
            prefilled={Boolean(shownEditing.initial)}
            itemId={shownEditing.item?.id}
            singular={meta.singular}
            versionSuggestions={versionSuggestions}
            onSubmit={submit}
            onCancel={closeEditor}
            onDirtyChange={setEditorDirty}
          />
        )}
      </Dialog>

      <Dialog
        open={picking}
        onOpenChange={setPicking}
        title={`Search Modrinth ${meta.title.toLowerCase()}`}
        description={`Find a ${meta.singular}, pick a version, then review it before adding. Only ${meta.title.toLowerCase()} are searched.`}
        size="wide"
      >
        {picking && (
          <ContentModrinthPicker
            contentKey={contentKey}
            items={items}
            modpack={data.modpack}
            onAdd={addFromModrinth}
            onOpenExisting={(item) => {
              setPicking(false);
              setEditing({ item });
            }}
            onCancel={() => setPicking(false)}
          />
        )}
      </Dialog>

      <Dialog
        open={linking}
        onOpenChange={setLinking}
        title={`Add ${meta.singular} from CurseForge`}
        description="Paste the CurseForge link. Nothing is downloaded or fetched; you enter and confirm the details."
        size="wide"
      >
        {linking && (
          <CurseForgeLink
            type={type}
            items={items}
            collectionTitle={meta.title}
            onCancel={() => setLinking(false)}
            onReview={(item) => {
              setLinking(false);
              setEditing({ item });
            }}
            onAttach={(item, link) => {
              setLinking(false);
              setEditing({
                item,
                initial: { ...inputFromItem(item), curseforgeUrl: link.url },
              });
            }}
            onContinue={(link) => {
              setLinking(false);
              setEditing({
                item: null,
                initial: {
                  ...emptyContentInput(),
                  name: nameFromSlug(link.slug),
                  source: "curseforge",
                  sourceUrl: link.url,
                  curseforgeUrl: link.url,
                },
              });
            }}
          />
        )}
      </Dialog>

      <Dialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard unsaved changes?"
        description="The changes in this form have not been added to the draft."
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmDiscard(false);
              setEditing(null);
            }}
          >
            Discard
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${shownDeleting?.name ?? ""}?`}
        description={`This removes it from the ${meta.title.toLowerCase()} draft. Mods are not changed.`}
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) {
                save(deleteContentItem(items, deleting.id));
                notify({
                  kind: "info",
                  title: `${deleting.name} deleted`,
                  description: "Stored in this browser’s draft.",
                });
              }
              setDeleting(null);
            }}
          >
            <Trash2 size={16} /> Delete
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title={`Replace ${meta.title.toLowerCase()}?`}
        description={`${shownImport?.fileName ?? "This file"} has ${shownImport?.value.items.length ?? 0} ${shownImport?.value.items.length === 1 ? "entry" : "entries"}. They will replace the ${items.length} in your draft. Mods and other collections are not changed.`}
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setPendingImport(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (pendingImport) {
                updateContent(contentKey, pendingImport.value);
                notify({
                  title: `${pendingImport.fileName} imported`,
                  description: "The data is now in your local draft.",
                });
              }
              setPendingImport(null);
            }}
          >
            <ArrowUpFromLine size={16} /> Replace with file
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
