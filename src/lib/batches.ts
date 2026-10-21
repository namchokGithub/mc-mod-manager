import { uniqueId } from "./mods";
import type { Batch, BatchFile, Mod, Step, StepItemRef } from "./schema";

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
    version: 2,
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

export function newStepId(items: Step[]): string {
  const ids = new Set(items.map((item) => item.id));
  let index = items.length + 1;
  while (ids.has(`step-${index}`)) index += 1;
  return `step-${index}`;
}

export function itemRefsOf(batch: Batch): StepItemRef[] {
  return batch.steps.flatMap((step) => step.itemRefs);
}

export function modIdsOf(batch: Batch): string[] {
  return itemRefsOf(batch)
    .filter((ref) => ref.type === "mod")
    .map((ref) => ref.id);
}

export type ModAssignmentLocation = {
  batchId: string;
  batchName: string;
  batchPosition: number;
  stepId: string;
  stepName: string;
};

/** Every Batch and Step that references each mod, in plan order. Read-only. */
export function modAssignmentLocations(
  file: BatchFile,
): Map<string, ModAssignmentLocation[]> {
  const locations = new Map<string, ModAssignmentLocation[]>();
  orderedBatches(file).forEach((batch, batchIndex) => {
    batch.steps.forEach((step) => {
      step.itemRefs.forEach((ref) => {
        if (ref.type !== "mod") return;
        const assignments = locations.get(ref.id) ?? [];
        assignments.push({
          batchId: batch.id,
          batchName: batch.name,
          batchPosition: batchIndex + 1,
          stepId: step.id,
          stepName: step.name,
        });
        locations.set(ref.id, assignments);
      });
    });
  });
  return locations;
}

const sameRef = (a: StepItemRef, b: StepItemRef) =>
  a.type === b.type && a.id === b.id;

/** Adds an item to one Step. An item can appear only once per batch. */
export function assignItem(
  batch: Batch,
  stepId: string,
  ref: StepItemRef,
): Batch {
  if (itemRefsOf(batch).some((other) => sameRef(other, ref))) return batch;
  return {
    ...batch,
    steps: batch.steps.map((step) =>
      step.id === stepId
        ? { ...step, itemRefs: [...step.itemRefs, { ...ref }] }
        : step,
    ),
  };
}

export function unassignItem(
  batch: Batch,
  stepId: string,
  ref: StepItemRef,
): Batch {
  return {
    ...batch,
    steps: batch.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            itemRefs: step.itemRefs.filter((other) => !sameRef(other, ref)),
          }
        : step,
    ),
  };
}

/** Moves an existing item between Steps in the same batch without changing its reference. */
export function moveItemToStep(
  batch: Batch,
  fromStepId: string,
  toStepId: string,
  ref: StepItemRef,
): Batch {
  if (fromStepId === toStepId) return batch;
  const from = batch.steps.find((step) => step.id === fromStepId);
  const to = batch.steps.find((step) => step.id === toStepId);
  if (!from || !to || !from.itemRefs.some((item) => sameRef(item, ref)))
    return batch;
  return {
    ...batch,
    steps: batch.steps.map((step) => {
      if (step.id === fromStepId)
        return {
          ...step,
          itemRefs: step.itemRefs.filter((item) => !sameRef(item, ref)),
        };
      if (step.id === toStepId)
        return step.itemRefs.some((item) => sameRef(item, ref))
          ? step
          : { ...step, itemRefs: [...step.itemRefs, { ...ref }] };
      return step;
    }),
  };
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
    batches: file.batches.map((batch) => {
      const hasTarget = itemRefsOf(batch).some(
        (ref) => ref.type === "mod" && ref.id === to,
      );
      return {
        ...batch,
        steps: batch.steps.map((step) => ({
          ...step,
          itemRefs: step.itemRefs.flatMap((ref) =>
            ref.type !== "mod" || ref.id !== from
              ? [ref]
              : hasTarget
                ? []
                : [{ ...ref, id: to }],
          ),
        })),
      };
    }),
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
    batches: file.batches.map((batch) => ({
      ...batch,
      steps: batch.steps.map((step) => ({
        ...step,
        itemRefs: step.itemRefs.filter(
          (ref) => ref.type !== "mod" || !removed.has(ref.id),
        ),
      })),
    })),
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
  for (const id of modIdsOf(batch)) {
    const mod = byId.get(id);
    if (mod) found.push(mod);
    else missing.push(id);
  }
  return { mods: found, missing };
}
