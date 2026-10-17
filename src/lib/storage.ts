import { serializeJson } from "./json";
import {
  collectionSchema,
  contentKeys,
  type Collection,
  type ContentKey,
} from "./schema";

export const DRAFT_KEY = "mc-mod-manager:draft:v1";

/**
 * Parses stored draft text; returns null when it is not a valid collection. Drafts saved before
 * the build plan, the inbox, or the content collections existed lack those sections; they take
 * them from `fallback` (the published data) so nothing is lost.
 */
export function parseDraft(
  raw: string,
  fallback?: Pick<Collection, "batches" | "inbox" | ContentKey>,
): Collection | null {
  try {
    const value = JSON.parse(raw) as unknown;
    const filled =
      fallback && value && typeof value === "object" && !Array.isArray(value)
        ? {
            ...Object.fromEntries(
              (["batches", "inbox", ...contentKeys] as const)
                .filter((key) => !(key in value))
                .map((key) => [key, fallback[key]]),
            ),
            ...value,
          }
        : value;
    const parsed = collectionSchema.safeParse(filled);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readDraft(
  storage: Pick<Storage, "getItem">,
): Collection | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    return raw ? parseDraft(raw) : null;
  } catch {
    return null;
  }
}

export const DRAFT_BACKUP_KEY = `${DRAFT_KEY}:unreadable`;

export type DraftLoad = {
  draft: Collection | null;
  /**
   * Set when a stored draft failed validation: "backed-up" means it was copied to
   * DRAFT_BACKUP_KEY; "unreadable" means storage refused the copy and it was left in place.
   */
  issue: "backed-up" | "unreadable" | null;
};

/**
 * Loads the draft for startup. An unreadable draft is copied aside before it can be overwritten by
 * the next save, and a draft identical to the published data is dropped as already published.
 */
export function loadDraft(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  published: Collection,
): DraftLoad {
  let raw: string | null;
  try {
    raw = storage.getItem(DRAFT_KEY);
  } catch {
    return { draft: null, issue: null };
  }
  if (!raw) return { draft: null, issue: null };
  const draft = parseDraft(raw, published);
  try {
    if (!draft) {
      storage.setItem(DRAFT_BACKUP_KEY, raw);
      storage.removeItem(DRAFT_KEY);
      return { draft: null, issue: "backed-up" };
    }
    if (serializeJson(draft) === serializeJson(published)) {
      storage.removeItem(DRAFT_KEY);
      return { draft: null, issue: null };
    }
  } catch {
    // Storage may be full or blocked; leave the stored draft untouched.
    return { draft, issue: draft ? null : "unreadable" };
  }
  return { draft, issue: null };
}

export { serializeJson };

export function saveDraft(
  storage: Pick<Storage, "setItem">,
  data: Collection,
): void {
  storage.setItem(DRAFT_KEY, JSON.stringify(data));
}

export function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, serializeJson(value), "application/json");
}

/** Saves text as a UTF-8 file in the browser; the temporary object URL is revoked afterwards. */
export function downloadText(
  filename: string,
  text: string,
  type: string,
): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
