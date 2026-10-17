import { createContext, useContext } from "react";
import type { FileSavePhase, SaveStatus } from "../lib/saveStatus";
import type { Batch, BatchFile, Collection, Mod, Modpack } from "../lib/schema";

export type DataContextValue = {
  data: Collection;
  published: Collection;
  dirty: boolean;
  saveState: "saved" | "saving" | "error";
  draftIssue: "backed-up" | "unreadable" | null;
  /** Increments each time another browser tab changes the draft. */
  externalUpdate: number;
  updateModpack: (modpack: Modpack) => void;
  saveMod: (mod: Mod, originalId?: string) => void;
  deleteMod: (id: string) => void;
  /** Deletes several mods in a single draft update. */
  deleteMods: (ids: string[]) => void;
  /** Replaces the build plan; `order` is rewritten from the array order. */
  updateBatches: (batches: Batch[]) => void;
  importBatches: (batches: BatchFile) => void;
  importModpack: (modpack: Modpack) => void;
  importMods: (mods: Mod[]) => void;
  reset: () => void;
  /** After the dev server wrote the files: they become the new saved-JSON baseline. */
  markSaved: (saved: Collection) => void;
  /** Local JSON save status: differs from the last saved JSON, and the last write's outcome. */
  saveStatus: SaveStatus | null;
  setFileSavePhase: (phase: FileSavePhase) => void;
};

export const DataContext = createContext<DataContextValue | null>(null);

export function useCollection(): DataContextValue {
  const context = useContext(DataContext);
  if (!context)
    throw new Error("useCollection must be used inside DataProvider");
  return context;
}
