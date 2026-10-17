import { collectionSchema, type Collection } from "./schema";

export const DRAFT_KEY = "mc-mod-manager:draft:v1";

export function readDraft(
  storage: Pick<Storage, "getItem">,
): Collection | null {
  try {
    const raw = storage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = collectionSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDraft(
  storage: Pick<Storage, "setItem">,
  data: Collection,
): void {
  storage.setItem(DRAFT_KEY, JSON.stringify(data));
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
