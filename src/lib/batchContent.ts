import {
  contentCollections,
  contentKeys,
  contentTypes,
  type Batch,
  type BatchFile,
  type Collection,
  type ContentItem,
  type ContentKey,
  type ContentType,
} from "./schema";
import { itemRefsOf } from "./batches";

/** Every collection a Step can reference. */
export type PlanItemType = "mod" | ContentType;
export type BatchContentRef = { type: ContentType; id: string };

export const contentKeyByType = Object.fromEntries(
  contentKeys.map((key) => [contentCollections[key].type, key]),
) as Record<ContentType, ContentKey>;

export const planTypeLabels: Record<
  PlanItemType,
  { one: string; many: string }
> = {
  mod: { one: "mod", many: "Mods" },
  resourcepack: { one: "resource pack", many: "Resource packs" },
  datapack: { one: "data pack", many: "Data packs" },
  shader: { one: "shader", many: "Shaders" },
};

/**
 * Where each kind of file usually goes. Informational only: some items have their own
 * instructions, and nothing is installed or checked off automatically.
 */
export const installGuidance: Record<PlanItemType, string> = {
  mod: "Mods usually go in the mods/ folder.",
  resourcepack:
    "Resource packs usually go in resourcepacks/, then are enabled in Options → Resource Packs.",
  datapack:
    "Data packs usually go in saves/<world>/datapacks/ for each world, or are added when creating a world. Some need world-specific setup.",
  shader:
    "Shader packs usually go in shaderpacks/ and need a shader runtime such as Iris or Oculus. Runtime support is not checked here.",
};

export function contentRefsOf(batch: Batch): BatchContentRef[] {
  return itemRefsOf(batch).flatMap((ref) =>
    ref.type === "mod" ? [] : [{ type: ref.type, id: ref.id }],
  );
}

/** Drops references to deleted entries of one type; other types and mods are untouched. */
export function removeContentFromBatches(
  file: BatchFile,
  type: ContentType,
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
          (ref) => ref.type !== type || !removed.has(ref.id),
        ),
      })),
    })),
  };
}

export type BatchContent = Record<
  ContentType,
  { items: ContentItem[]; missing: string[] }
>;

/** Resolves a batch's content references by type + ID; unknown IDs are reported, never dropped. */
export function batchContent(
  batch: Batch,
  collection: Pick<Collection, ContentKey>,
): BatchContent {
  const result = Object.fromEntries(
    contentTypes.map((type) => [type, { items: [], missing: [] }]),
  ) as unknown as BatchContent;
  const lookup = Object.fromEntries(
    contentTypes.map((type) => [
      type,
      new Map(
        collection[contentKeyByType[type]].items.map((item) => [item.id, item]),
      ),
    ]),
  ) as Record<ContentType, Map<string, ContentItem>>;
  for (const ref of contentRefsOf(batch)) {
    const item = lookup[ref.type].get(ref.id);
    if (item) result[ref.type].items.push(item);
    else result[ref.type].missing.push(ref.id);
  }
  return result;
}

/** "3 mods · 1 resource pack": only types with entries, mods always shown. */
export function batchCountText(
  modCount: number,
  content: BatchContent,
): string {
  const word = (count: number, type: PlanItemType) => {
    const { one } = planTypeLabels[type];
    return `${count} ${one}${count === 1 ? "" : "s"}`;
  };
  return [
    word(modCount, "mod"),
    ...contentTypes.flatMap((type) =>
      content[type].items.length
        ? [word(content[type].items.length, type)]
        : [],
    ),
  ].join(" · ");
}
