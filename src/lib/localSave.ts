import { serializeJson } from "./json";
import { SAVE_ENDPOINT, SAVE_HEADER } from "./localSaveProtocol";
import { collectionSchema, contentKeys, type Collection } from "./schema";

export type LocalSaveResult =
  | { kind: "saved"; collection: Collection }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

/** SHA-256 of the exact text that would be written; the dev server computes the same value. */
export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializeJson(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Asks the dev server to write public/data/*.json. `baseline` is the data this page loaded; the
 * server refuses with a conflict if the files changed since, unless `force` is set.
 */
export async function saveToLocalJson(
  collection: Collection,
  baseline: Collection,
  force = false,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<LocalSaveResult> {
  let response: Response;
  try {
    response = await fetchImpl(SAVE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SAVE_HEADER]: "1" },
      body: JSON.stringify({
        modpack: collection.modpack,
        mods: collection.mods,
        batches: collection.batches,
        inbox: collection.inbox,
        ...Object.fromEntries(contentKeys.map((key) => [key, collection[key]])),
        baseline: {
          modpack: await fingerprint(baseline.modpack),
          mods: await fingerprint(baseline.mods),
          batches: await fingerprint(baseline.batches),
          inbox: await fingerprint(baseline.inbox),
          ...Object.fromEntries(
            await Promise.all(
              contentKeys.map(
                async (key) => [key, await fingerprint(baseline[key])] as const,
              ),
            ),
          ),
        },
        force,
      }),
    });
  } catch {
    return {
      kind: "error",
      message: "Could not reach the dev server. Is pnpm dev still running?",
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON error pages fall through to the generic message below.
  }
  const data = (body ?? {}) as Record<string, unknown>;
  if (response.status === 409 && data.error === "conflict")
    return {
      kind: "conflict",
      message:
        typeof data.message === "string"
          ? data.message
          : "The files changed on disk.",
    };
  if (response.ok) {
    const saved = collectionSchema.safeParse({
      modpack: data.modpack,
      mods: data.mods,
      batches: data.batches,
      inbox: data.inbox,
      ...Object.fromEntries(contentKeys.map((key) => [key, data[key]])),
    });
    if (saved.success) return { kind: "saved", collection: saved.data };
    return {
      kind: "error",
      message: "The dev server sent an unexpected reply.",
    };
  }
  return {
    kind: "error",
    message:
      typeof data.error === "string"
        ? data.error
        : `Saving failed (HTTP ${response.status}).`,
  };
}
