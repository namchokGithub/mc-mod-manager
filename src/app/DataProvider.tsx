import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  collectionSchema,
  modsSchema,
  type Collection,
  batchFileSchema,
  inboxFileSchema,
  contentCollections,
  contentFileSchema,
  contentKeys,
} from "../lib/schema";
import { DRAFT_KEY, loadDraft, parseDraft, saveDraft } from "../lib/storage";
import {
  removeModsFromBatches,
  renameModInBatches,
  withOrder,
} from "../lib/batches";
import { removeMods, stampSavedMod, withAddedAt } from "../lib/mods";
import { removeContentFromBatches } from "../lib/batchContent";
import {
  deriveSaveStatus,
  hasUnsavedChanges,
  type FileSavePhase,
} from "../lib/saveStatus";
import { DataContext, type DataContextValue } from "./DataContext";

// Drafts belong to the editor, which only runs in `pnpm dev`. Production always shows the
// published files and leaves any old draft in LocalStorage untouched.
const DRAFTS_ENABLED = import.meta.env.DEV;

function jsonUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState<Collection | null>(null);
  const [data, setData] = useState<Collection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [loadError, setLoadError] = useState("");
  const [draftIssue, setDraftIssue] = useState<
    "backed-up" | "unreadable" | null
  >(null);
  const [externalUpdate, setExternalUpdate] = useState(0);
  const [fileSavePhase, setFileSavePhase] = useState<FileSavePhase>("idle");
  // `published` is the last JSON read from or written to public/data.
  const unsaved = useMemo(
    () => Boolean(data && published && hasUnsavedChanges(data, published)),
    [data, published],
  );
  // Set when a draft arrives from another tab, so it is not written straight back.
  const skipNextSave = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [responses, batchesResponse, inboxResponse, contentResponses] =
          await Promise.all([
            Promise.all([
              fetch(jsonUrl("modpack.json")),
              fetch(jsonUrl("mods.json")),
            ]),
            fetch(jsonUrl("batches.json")),
            fetch(jsonUrl("mod-inbox.json")),
            Promise.all(
              contentKeys.map((key) =>
                fetch(jsonUrl(contentCollections[key].file)),
              ),
            ),
          ]);
        if (responses.some((response) => !response.ok))
          throw new Error("Published JSON files could not be loaded.");
        const values = await Promise.all(
          responses.map((response) => response.json() as Promise<unknown>),
        );
        // batches.json is optional: a missing file means an empty build plan.
        const batches: unknown = batchesResponse.ok
          ? await batchesResponse.json()
          : undefined;
        // mod-inbox.json is optional too: a missing file means an empty inbox.
        const inbox: unknown = inboxResponse.ok
          ? await inboxResponse.json()
          : undefined;
        // Content files are optional as well: a missing file is an empty collection.
        const content = Object.fromEntries(
          await Promise.all(
            contentKeys.map(async (key, index) => {
              const response = contentResponses[index];
              return [
                key,
                response?.ok ? ((await response.json()) as unknown) : undefined,
              ] as const;
            }),
          ),
        );
        const result = collectionSchema.safeParse({
          modpack: values[0],
          mods: values[1],
          batches,
          inbox,
          ...content,
        });
        if (!result.success)
          throw new Error("Published JSON files have invalid data.");
        if (!active) return;
        setPublished(result.data);
        if (!DRAFTS_ENABLED) {
          setData(result.data);
          return;
        }
        const { draft, issue } = loadDraft(window.localStorage, result.data);
        const loaded = draft ?? result.data;
        // One-time backfill with a single timestamp. It becomes an unsaved draft change, so it
        // is written to mods.json only by Save to Local JSON; the draft keeps it across reloads.
        const mods = withAddedAt(loaded.mods, new Date());
        setData(mods === loaded.mods ? loaded : { ...loaded, mods });
        setDirty(Boolean(draft) || mods !== loaded.mods);
        setDraftIssue(issue);
      } catch (error) {
        if (active)
          setLoadError(
            error instanceof Error ? error.message : "Unable to load data.",
          );
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  // Another tab saved or reset the draft: show its version instead of overwriting it later.
  useEffect(() => {
    if (!published || !DRAFTS_ENABLED) return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== DRAFT_KEY && event.key !== null) return;
      if (event.key === null || event.newValue === null) {
        setData(published);
        setDirty(false);
        setSaveState("saved");
        setExternalUpdate((count) => count + 1);
        return;
      }
      const next = parseDraft(event.newValue, published);
      if (!next) return;
      skipNextSave.current = true;
      setData(next);
      setDirty(true);
      setSaveState("saved");
      setExternalUpdate((count) => count + 1);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [published]);

  useEffect(() => {
    if (!data || !dirty || !DRAFTS_ENABLED) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      try {
        saveDraft(window.localStorage, data);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [data, dirty]);

  if (loadError)
    return (
      <div className="state-screen">
        <h1>Unable to open the collection</h1>
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  if (!data || !published)
    return (
      <div className="state-screen">
        <div className="loading-orb" />
        <p>Loading the collection…</p>
      </div>
    );

  const change = (next: Collection) => {
    setData(next);
    setDirty(true);
    setSaveState("saving");
  };

  const value: DataContextValue = {
    data,
    published,
    dirty,
    saveState,
    draftIssue,
    externalUpdate,
    updateModpack: (modpack) => change({ ...data, modpack }),
    saveMod: (input, originalId) => {
      const previous = originalId
        ? data.mods.find((item) => item.id === originalId)
        : undefined;
      const mod = stampSavedMod(input, previous, new Date());
      const nextMods = originalId
        ? data.mods.map((item) => (item.id === originalId ? mod : item))
        : [...data.mods, mod];
      change({
        ...data,
        mods: modsSchema.parse(nextMods),
        // A changed mod ID is followed in the build plan.
        batches: originalId
          ? renameModInBatches(data.batches, originalId, mod.id)
          : data.batches,
      });
    },
    deleteMod: (id) =>
      change({
        ...data,
        mods: data.mods.filter((mod) => mod.id !== id),
        batches: removeModsFromBatches(data.batches, [id]),
      }),
    deleteMods: (ids) =>
      change({
        ...data,
        mods: removeMods(data.mods, ids),
        batches: removeModsFromBatches(data.batches, ids),
      }),
    updateBatches: (batches) =>
      change({ ...data, batches: batchFileSchema.parse(withOrder(batches)) }),
    importBatches: (batches) => change({ ...data, batches }),
    updateInbox: (entries) =>
      change({
        ...data,
        inbox: inboxFileSchema.parse({ version: 1, entries }),
      }),
    promoteInbox: (created, promotedIds) => {
      // Validated before anything changes, so a failure leaves mods and inbox untouched.
      const mods = modsSchema.parse(
        withAddedAt([...data.mods, ...created], new Date()),
      );
      const removed = new Set(promotedIds);
      change({
        ...data,
        mods,
        inbox: {
          ...data.inbox,
          entries: data.inbox.entries.filter((entry) => !removed.has(entry.id)),
        },
      });
    },
    updateContent: (key, file, deletedIds = []) =>
      change({
        ...data,
        [key]: contentFileSchema(contentCollections[key].type).parse(file),
        batches: deletedIds.length
          ? removeContentFromBatches(
              data.batches,
              contentCollections[key].type,
              deletedIds,
            )
          : data.batches,
      }),
    importModpack: (modpack) => change({ ...data, modpack }),
    // Imports and multi-adds: new mods without `addedAt` get it now; existing values are kept.
    importMods: (mods) =>
      change({ ...data, mods: withAddedAt(mods, new Date()) }),
    markSaved: (saved) => {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Nothing to clear when storage is blocked.
      }
      setPublished(saved);
      setData(saved);
      setDirty(false);
      setSaveState("saved");
      setFileSavePhase("saved");
    },
    saveStatus: deriveSaveStatus(fileSavePhase, unsaved),
    setFileSavePhase,
    reset: () => {
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Blocked storage has no draft to remove.
      }
      setData(published);
      setDirty(false);
      setSaveState("saved");
    },
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
