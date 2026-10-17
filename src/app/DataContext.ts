import { createContext, useContext } from "react";
import type { Collection, Mod, Modpack } from "../lib/schema";

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
  importModpack: (modpack: Modpack) => void;
  importMods: (mods: Mod[]) => void;
  reset: () => void;
  /** After the dev server wrote the files: they become the new published baseline. */
  markSaved: (saved: Collection) => void;
};

export const DataContext = createContext<DataContextValue | null>(null);

export function useCollection(): DataContextValue {
  const context = useContext(DataContext);
  if (!context)
    throw new Error("useCollection must be used inside DataProvider");
  return context;
}
