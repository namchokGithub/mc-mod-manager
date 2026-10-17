import { uniqueId } from "./mods";
import { sortMinecraftVersions } from "./modrinth/versionFilters";
import {
  contentCollections,
  contentFileSchema,
  contentKeys,
  contentItemSchema,
  formatValidationError,
  type ContentFile,
  type ContentItem,
  type ContentKey,
} from "./schema";

export const contentMeta: Record<
  ContentKey,
  { title: string; singular: string; description: string }
> = {
  resourcePacks: {
    title: "Resource packs",
    singular: "resource pack",
    description: "Textures, models, sounds, and UI changes loaded by the game.",
  },
  dataPacks: {
    title: "Data packs",
    singular: "data pack",
    description:
      "Recipes, loot, structures, and world rules added to a world's datapacks folder.",
  },
  shaders: {
    title: "Shaders",
    singular: "shader",
    description:
      "Shader packs for a shader runtime such as Iris or Oculus. Runtime support is not checked yet.",
  },
};

export const isContentKey = (value: string): value is ContentKey =>
  (contentKeys as string[]).includes(value);

export const contentStatusLabels: Record<ContentItem["status"], string> = {
  planned: "Planned",
  testing: "Testing",
  installed: "Installed",
};

export const contentSourceLabels: Record<ContentItem["source"], string> = {
  modrinth: "Modrinth",
  curseforge: "CurseForge",
  manual: "Manual",
  other: "Other",
};

/** Editable fields; the ID and timestamps are managed here, never by the form. */
export type ContentInput = Pick<
  ContentItem,
  | "name"
  | "status"
  | "version"
  | "description"
  | "source"
  | "sourceUrl"
  | "imageUrl"
  | "minecraftVersions"
  | "tags"
  | "notes"
>;

export const emptyContentInput = (): ContentInput => ({
  name: "",
  status: "planned",
  version: "",
  description: "",
  source: "manual",
  sourceUrl: "",
  imageUrl: "",
  minecraftVersions: [],
  tags: [],
  notes: "",
});

function clean(input: ContentInput): ContentInput {
  return {
    ...input,
    name: input.name.trim().replace(/\s+/g, " "),
    version: input.version.trim(),
    description: input.description.trim(),
    sourceUrl: input.sourceUrl.trim(),
    imageUrl: input.imageUrl.trim(),
    minecraftVersions: sortMinecraftVersions(
      input.minecraftVersions.map((value) => value.trim()).filter(Boolean),
    ),
    tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))],
    notes: input.notes.trim(),
  };
}

export type ContentResult =
  | { ok: true; items: ContentItem[]; item: ContentItem }
  | { ok: false; errors: Partial<Record<keyof ContentInput, string>> };

function validate(
  item: unknown,
):
  | { item: ContentItem }
  | { errors: Partial<Record<keyof ContentInput, string>> } {
  const parsed = contentItemSchema.safeParse(item);
  if (parsed.success) return { item: parsed.data };
  const errors: Partial<Record<keyof ContentInput, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ContentInput;
    errors[field] ??= issue.message;
  }
  return { errors };
}

/** Adds a new entry with an ID made once from its name; the ID never changes afterwards. */
export function addContentItem(
  items: ContentItem[],
  input: ContentInput,
  now = new Date(),
): ContentResult {
  const values = clean(input);
  const at = now.toISOString();
  const checked = validate({
    id: uniqueId(values.name, items),
    ...values,
    createdAt: at,
    updatedAt: at,
  });
  if ("errors" in checked) return { ok: false, errors: checked.errors };
  return { ok: true, items: [...items, checked.item], item: checked.item };
}

/** Replaces the editable fields of one entry. ID, creation date, and unknown fields are kept. */
export function updateContentItem(
  items: ContentItem[],
  id: string,
  input: ContentInput,
  now = new Date(),
): ContentResult {
  const existing = items.find((item) => item.id === id);
  if (!existing)
    return { ok: false, errors: { name: "This entry no longer exists." } };
  const checked = validate({
    ...existing,
    ...clean(input),
    id: existing.id,
    updatedAt: now.toISOString(),
  });
  if ("errors" in checked) return { ok: false, errors: checked.errors };
  return {
    ok: true,
    items: items.map((item) => (item.id === id ? checked.item : item)),
    item: checked.item,
  };
}

export function deleteContentItem(
  items: ContentItem[],
  id: string,
): ContentItem[] {
  return items.filter((item) => item.id !== id);
}

export function inputFromItem(item: ContentItem): ContentInput {
  return {
    name: item.name,
    status: item.status,
    version: item.version,
    description: item.description,
    source: item.source,
    sourceUrl: item.sourceUrl,
    imageUrl: item.imageUrl,
    minecraftVersions: item.minecraftVersions,
    tags: item.tags,
    notes: item.notes,
  };
}

export type ContentSort = "name" | "name-desc" | "updated" | "status";
export type ContentQuery = {
  query: string;
  status: ContentItem["status"] | "";
  sort: ContentSort;
};
export const initialContentQuery: ContentQuery = {
  query: "",
  status: "",
  sort: "name",
};

const statusOrder: Record<ContentItem["status"], number> = {
  installed: 0,
  testing: 1,
  planned: 2,
};

/** Search by name, filter by status, and sort. Never changes the input. */
export function queryContent(
  items: ContentItem[],
  { query, status, sort }: ContentQuery,
): ContentItem[] {
  const needle = query.trim().toLowerCase();
  const byName = (a: ContentItem, b: ContentItem) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return items
    .filter(
      (item) =>
        (!needle || item.name.toLowerCase().includes(needle)) &&
        (!status || item.status === status),
    )
    .sort((a, b) => {
      if (sort === "name-desc") return byName(b, a);
      if (sort === "updated")
        return (
          (Date.parse(b.updatedAt ?? "") || 0) -
            (Date.parse(a.updatedAt ?? "") || 0) || byName(a, b)
        );
      if (sort === "status")
        return statusOrder[a.status] - statusOrder[b.status] || byName(a, b);
      return byName(a, b);
    });
}

/** Reads an imported file for one collection. Throws a readable message; nothing is changed. */
export function parseContentFile(text: string, key: ContentKey): ContentFile {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const result = contentFileSchema(contentCollections[key].type).safeParse(
    value,
  );
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data;
}
