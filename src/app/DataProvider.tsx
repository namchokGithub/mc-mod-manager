import { useEffect, useRef, useState, type ReactNode } from "react";
import { collectionSchema, modsSchema, type Collection } from "../lib/schema";
import { DRAFT_KEY, loadDraft, parseDraft, saveDraft } from "../lib/storage";
import { DataContext, type DataContextValue } from "./DataContext";

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
  // Set when a draft arrives from another tab, so it is not written straight back.
  const skipNextSave = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const responses = await Promise.all([
          fetch(jsonUrl("modpack.json")),
          fetch(jsonUrl("mods.json")),
        ]);
        if (responses.some((response) => !response.ok))
          throw new Error("Published JSON files could not be loaded.");
        const values = await Promise.all(
          responses.map((response) => response.json() as Promise<unknown>),
        );
        const result = collectionSchema.safeParse({
          modpack: values[0],
          mods: values[1],
        });
        if (!result.success)
          throw new Error("Published JSON files have invalid data.");
        if (!active) return;
        setPublished(result.data);
        const { draft, issue } = loadDraft(window.localStorage, result.data);
        setData(draft ?? result.data);
        setDirty(Boolean(draft));
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
    if (!published) return;
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
      const next = parseDraft(event.newValue);
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
    if (!data || !dirty) return;
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
    saveMod: (mod, originalId) => {
      const nextMods = originalId
        ? data.mods.map((item) => (item.id === originalId ? mod : item))
        : [...data.mods, mod];
      change({ ...data, mods: modsSchema.parse(nextMods) });
    },
    deleteMod: (id) =>
      change({ ...data, mods: data.mods.filter((mod) => mod.id !== id) }),
    importModpack: (modpack) => change({ ...data, modpack }),
    importMods: (mods) => change({ ...data, mods }),
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
