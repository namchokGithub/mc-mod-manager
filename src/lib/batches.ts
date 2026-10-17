import { uniqueId } from "./mods";
import type { Batch, BatchFile, ChecklistItem, Mod } from "./schema";

/** Batches sorted by their `order`; stable for equal orders. */
export function orderedBatches(file: BatchFile): Batch[] {
  return file.batches
    .map((batch, index) => ({ batch, index }))
    .sort((a, b) => a.batch.order - b.batch.order || a.index - b.index)
    .map(({ batch }) => batch);
}

/** Rewrites `order` as 1, 2, 3… following the array order. */
export function withOrder(batches: Batch[]): BatchFile {
  return {
    version: 1,
    batches: batches.map((batch, index) => ({ ...batch, order: index + 1 })),
  };
}

/** Moves an item up or down by one; returns the same array when the move is out of range. */
export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  )
    return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item as T);
  return next;
}

/** A unique, readable ID from a name ("Core libraries" -> "core-libraries"). */
export function newBatchId(name: string, batches: Batch[]): string {
  return uniqueId(name, batches);
}

export function newChecklistId(items: ChecklistItem[]): string {
  const ids = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  while (ids.has(`step-${index}`)) index += 1;
  return `step-${index}`;
}

/** Adds a mod once; a mod already in this batch is not added again. */
export function assignMod(batch: Batch, modId: string): Batch {
  return batch.modIds.includes(modId)
    ? batch
    : { ...batch, modIds: [...batch.modIds, modId] };
}

export function unassignMod(batch: Batch, modId: string): Batch {
  return { ...batch, modIds: batch.modIds.filter((id) => id !== modId) };
}

/** Follows a mod ID change (renamed in the editor) in every batch. */
export function renameModInBatches(
  file: BatchFile,
  from: string,
  to: string,
): BatchFile {
  if (from === to) return file;
  return {
    ...file,
    batches: file.batches.map((batch) =>
      batch.modIds.includes(from)
        ? {
            ...batch,
            modIds: [
              ...new Set(batch.modIds.map((id) => (id === from ? to : id))),
            ],
          }
        : batch,
    ),
  };
}

/** Drops references to deleted mods; batches themselves are kept. */
export function removeModsFromBatches(
  file: BatchFile,
  ids: Iterable<string>,
): BatchFile {
  const removed = new Set(ids);
  return {
    ...file,
    batches: file.batches.map((batch) =>
      batch.modIds.some((id) => removed.has(id))
        ? { ...batch, modIds: batch.modIds.filter((id) => !removed.has(id)) }
        : batch,
    ),
  };
}

/** Resolves a batch's mod IDs; IDs with no matching mod are reported, not thrown. */
export function batchMods(
  batch: Batch,
  mods: Mod[],
): { mods: Mod[]; missing: string[] } {
  const byId = new Map(mods.map((mod) => [mod.id, mod]));
  const found: Mod[] = [];
  const missing: string[] = [];
  for (const id of batch.modIds) {
    const mod = byId.get(id);
    if (mod) found.push(mod);
    else missing.push(id);
  }
  return { mods: found, missing };
}
