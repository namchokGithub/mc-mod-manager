import { serializeJson } from "./json";
import type { Collection } from "./schema";

/** Where the last write to public/data/*.json stands. The browser draft does not count. */
export type FileSavePhase = "idle" | "saving" | "saved" | "failed";
export type SaveStatus = "unsaved" | "saving" | "saved" | "failed";

export const saveStatusLabels: Record<SaveStatus, string> = {
  unsaved: "Unsaved changes",
  saving: "Saving...",
  saved: "Saved locally",
  failed: "Save failed",
};

/** True when the data differs from the last JSON loaded from or written to disk. */
export function hasUnsavedChanges(
  data: Collection,
  savedJson: Collection,
): boolean {
  return serializeJson(data) !== serializeJson(savedJson);
}

/**
 * Status for the Manage page and header. "Saved locally" appears only after a successful file
 * write in this session; null means nothing to report (fresh load, no edits).
 */
export function deriveSaveStatus(
  phase: FileSavePhase,
  unsaved: boolean,
): SaveStatus | null {
  if (phase === "saving") return "saving";
  if (phase === "failed" && unsaved) return "failed";
  if (unsaved) return "unsaved";
  return phase === "saved" ? "saved" : null;
}
