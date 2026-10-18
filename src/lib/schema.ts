import { z } from "zod";
import { parseCurseForgeUrl } from "./curseforge";
import { isPublicAssetPath } from "./heroImage";

const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    "Use an http or https URL",
  );
const optionalUrl = z.union([httpUrl, z.literal("")]);
const heroImage = z
  .string()
  .refine(
    (value) => optionalUrl.safeParse(value).success || isPublicAssetPath(value),
    "Use an http or https URL or a path under public/assets/",
  );
const dateString = z.iso.date();

export const modpackSchema = z.object({
  name: z.string().trim().min(1, "Modpack name is required"),
  description: z.string(),
  version: z.string(),
  minecraftVersion: z.string(),
  modloader: z.string(),
  modloaderVersion: z.string(),
  author: z.string(),
  updatedAt: dateString,
  heroImageUrl: heroImage,
});

export const dependencyTypes = [
  "required",
  "optional",
  "incompatible",
  "embedded",
] as const;

// Snapshot of the selected Modrinth version, so the static site can check compatibility offline.
export const modrinthMetaSchema = z.object({
  projectId: z.string().trim().min(1),
  slug: z.string().optional(),
  versionId: z.string().trim().min(1).optional(),
  versionNumber: z.string().optional(),
  versionType: z.string().optional(),
  datePublished: z.string().optional(),
  gameVersions: z.array(z.string()).optional(),
  loaders: z.array(z.string()).optional(),
  dependencies: z
    .array(
      z.object({
        projectId: z.string().nullable(),
        versionId: z.string().nullable(),
        type: z.enum(dependencyTypes),
        name: z.string().optional(),
      }),
    )
    .optional(),
  syncedAt: z.string().optional(),
});

export const verificationSources = ["curseforge", "official", "other"] as const;

// What the user confirmed by hand for one exact version. Evidence for these values only, never
// for dependencies; it applies only while the mod's active values still match it.
export const manualVerificationSchema = z.object({
  source: z.enum(verificationSources),
  version: z.string().trim().min(1, "Version is required"),
  gameVersions: z
    .array(z.string().trim().min(1))
    .min(1, "Add at least one Minecraft version"),
  loaders: z
    .array(z.string().trim().min(1))
    .min(1, "Add at least one modloader"),
  evidenceUrl: httpUrl,
  verifiedAt: z.iso.datetime(),
});

export const modSchema = z.object({
  id: z.string().trim().min(1, "ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  version: z.string(),
  category: z.string().trim().min(1, "Category is required"),
  tags: z.array(z.string().trim().min(1)),
  status: z.enum(["planned", "testing", "installed", "disabled", "removed"]),
  side: z.enum(["client", "server", "both"]),
  // Modpack policy, separate from side and compatibility. Missing means "required", so older
  // mods.json files need no rewrite; the editor stores only "optional".
  requirement: z.enum(["required", "optional"]).optional(),
  source: z.enum(["Modrinth", "CurseForge", "GitHub", "Other"]),
  sourceUrl: optionalUrl,
  description: z.string(),
  dependencies: z.array(z.string().trim().min(1)),
  notes: z.string(),
  imageUrl: optionalUrl,
  modrinth: modrinthMetaSchema.optional(),
  // Set when the entry came from a local .jar; used to spot re-imports of the same file.
  file: z
    .object({
      name: z.string(),
      sha1: z
        .string()
        .regex(/^[0-9a-f]{40}$/)
        .optional(),
      modId: z.string().optional(),
      // Metadata read from the JAR, kept so compatibility can be checked without the file.
      format: z
        .enum([
          "fabric.mod.json",
          "quilt.mod.json",
          "neoforge.mods.toml",
          "mods.toml",
          "filename",
        ])
        .optional(),
      loaders: z.array(z.string()).optional(),
      loadersInferred: z.boolean().optional(),
      minecraftRange: z.string().optional(),
      dependencies: z
        .array(
          z.object({
            modId: z.string().trim().min(1),
            kind: z.enum([
              "required",
              "optional",
              "incompatible",
              "discouraged",
            ]),
            versionRange: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  // Entered by hand in the editor when no verified data exists. Never treated as verified.
  manualCompatibility: z
    .object({
      gameVersions: z.array(z.string().trim().min(1)),
      loaders: z.array(z.string().trim().min(1)),
    })
    .optional(),
  manualVerification: manualVerificationSchema.optional(),
  // When the mod was first added (ISO 8601, UTC). Set once and never changed by edits or updates;
  // optional so older mods.json files still load.
  addedAt: z.iso.datetime().optional(),
  // Required or optional dependencies the user marked as not needed for this pack, e.g. Fabric
  // API listed on a multi-loader Modrinth version. `id` is a Modrinth project ID or JAR mod ID.
  ignoredDependencies: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        reason: z.string().trim().min(1, "Give a reason for ignoring it"),
      }),
    )
    .optional(),
  // Dependencies confirmed to be provided by another mod in the list, when IDs do not match on
  // their own (e.g. JAR mod ID "sophisticatedcore" vs. list ID "sophisticated-core"). `id` is
  // the Modrinth project ID or JAR mod ID; `modId` is the providing mod's ID in this list.
  dependencyLinks: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        modId: z.string().trim().min(1),
      }),
    )
    .refine(
      (links) => new Set(links.map((link) => link.id)).size === links.length,
      "A dependency is linked twice",
    )
    .optional(),
});

export const modsSchema = z.array(modSchema).superRefine((mods, context) => {
  const seen = new Set<string>();
  mods.forEach((mod, index) => {
    if (seen.has(mod.id)) {
      context.addIssue({
        code: "custom",
        path: [index, "id"],
        message: `Duplicate mod ID: ${mod.id}`,
      });
    }
    seen.add(mod.id);
  });
});

const uniqueStrings = (values: string[]) =>
  new Set(values).size === values.length;

// Build plan (public/data/batches.json): ordered installation batches that reference mods by ID.
export const checklistItemSchema = z.object({
  id: z.string().trim().min(1),
  text: z.string().trim().min(1, "Checklist step is empty"),
  /** Planning progress only; it never changes a mod's status. */
  done: z.boolean(),
});

export const contentTypes = ["resourcepack", "datapack", "shader"] as const;

// A batch reference to a resource pack, data pack, or shader. Mods stay in `modIds`.
export const batchContentRefSchema = z.object({
  type: z.enum(contentTypes),
  id: z.string().trim().min(1),
});

export const batchSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Batch name is required"),
  description: z.string().default(""),
  order: z.number().int().min(1),
  modIds: z
    .array(z.string().trim().min(1))
    .refine(uniqueStrings, "A mod is listed twice in this batch"),
  // Optional, so batches.json files from before other content existed load unchanged.
  // Unique by type + ID; the same ID may exist in different collections.
  contentRefs: z
    .array(batchContentRefSchema)
    .refine(
      (refs) => uniqueStrings(refs.map((ref) => `${ref.type}:${ref.id}`)),
      "An item is listed twice in this batch",
    )
    .optional(),
  checklist: z
    .array(checklistItemSchema)
    .refine(
      (items) => uniqueStrings(items.map((item) => item.id)),
      "Checklist step IDs must be unique",
    ),
});

export const batchFileSchema = z.object({
  version: z.literal(1),
  batches: z.array(batchSchema).superRefine((batches, context) => {
    const seen = new Set<string>();
    batches.forEach((batch, index) => {
      if (seen.has(batch.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate batch ID: ${batch.id}`,
        });
      seen.add(batch.id);
    });
  }),
});

export const emptyBatchFile = (): z.infer<typeof batchFileSchema> => ({
  version: 1,
  batches: [],
});

// Mod Inbox (public/data/mod-inbox.json): names waiting to become mods. Not part of the collection.
export const inboxEntrySchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1, "Name is required"),
  notes: z.string().default(""),
  createdAt: z.iso.datetime(),
});

export const inboxFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(inboxEntrySchema).superRefine((entries, context) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      if (seen.has(entry.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate inbox entry ID: ${entry.id}`,
        });
      seen.add(entry.id);
    });
  }),
});

export const emptyInboxFile = (): z.infer<typeof inboxFileSchema> => ({
  version: 1,
  entries: [],
});

// Additional content (public/data/resource-packs.json, data-packs.json, shaders.json). Separate
// from mods: no modloader, dependency, or compatibility fields. Entered by hand, never verified.
export const contentSources = [
  "modrinth",
  "curseforge",
  "manual",
  "other",
] as const;
export const contentStatuses = ["planned", "testing", "installed"] as const;

// Loose: fields this version does not know are kept through import, edit, and save.
export const contentItemSchema = z.looseObject({
  id: z.string().trim().min(1, "ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  status: z.enum(contentStatuses),
  version: z.string().default(""),
  description: z.string().default(""),
  source: z.enum(contentSources).default("manual"),
  sourceUrl: optionalUrl.default(""),
  imageUrl: optionalUrl.default(""),
  minecraftVersions: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  notes: z.string().default(""),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
  // Provider snapshot from a Modrinth import, same shape as for mods. For shaders, `loaders`
  // holds shader runtimes (e.g. iris), not modloaders. Never treated as manually verified.
  modrinth: modrinthMetaSchema.optional(),
  // A CurseForge page the user linked by hand (primary or additional source). Only the URL is
  // known; nothing was fetched. `fileId` is set only when the URL itself names a file.
  curseforge: z
    .object({
      url: z
        .string()
        .refine(
          (value) => parseCurseForgeUrl(value).ok,
          "Use a CurseForge resource pack, data pack, or shader link",
        ),
      slug: z.string().trim().min(1),
      fileId: z.string().regex(/^\d+$/).optional(),
    })
    .optional(),
  // User-confirmed values for one version; no modloaders for this content.
  manualVerification: manualVerificationSchema
    .omit({ loaders: true })
    .optional(),
});

export const contentItemsSchema = z
  .array(contentItemSchema)
  .superRefine((items, context) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id))
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate ID: ${item.id}`,
        });
      seen.add(item.id);
    });
  });

export type ContentType = (typeof contentTypes)[number];

export const emptyContentFile = (type: ContentType) => ({
  version: 1 as const,
  type,
  items: [],
});

/** One content file; `type` must match, so a shaders file cannot load as resource packs. */
export function contentFileSchema(type: ContentType) {
  return z.object({
    version: z.literal(1),
    type: z.literal(type, {
      error: `This is not a ${type} file (expected "type": "${type}").`,
    }),
    items: contentItemsSchema,
  });
}

/** Empty resource pack, data pack, and shader collections. */
export const emptyContent = () => ({
  resourcePacks: emptyContentFile("resourcepack"),
  dataPacks: emptyContentFile("datapack"),
  shaders: emptyContentFile("shader"),
});

/** Collection key, content type, and file name for each additional collection. */
export const contentCollections = {
  resourcePacks: { type: "resourcepack", file: "resource-packs.json" },
  dataPacks: { type: "datapack", file: "data-packs.json" },
  shaders: { type: "shader", file: "shaders.json" },
} as const satisfies Record<string, { type: ContentType; file: string }>;
export type ContentKey = keyof typeof contentCollections;
export const contentKeys = Object.keys(contentCollections) as ContentKey[];

export const collectionSchema = z.object({
  modpack: modpackSchema,
  mods: modsSchema,
  // Optional in stored data so older drafts and collections without a plan still load.
  batches: batchFileSchema.default(emptyBatchFile),
  inbox: inboxFileSchema.default(emptyInboxFile),
  resourcePacks: contentFileSchema("resourcepack").default(() =>
    emptyContentFile("resourcepack"),
  ),
  dataPacks: contentFileSchema("datapack").default(() =>
    emptyContentFile("datapack"),
  ),
  shaders: contentFileSchema("shader").default(() =>
    emptyContentFile("shader"),
  ),
});

export type Modpack = z.infer<typeof modpackSchema>;
export type Mod = z.infer<typeof modSchema>;
export type ModrinthMeta = z.infer<typeof modrinthMetaSchema>;
export type ManualVerification = z.infer<typeof manualVerificationSchema>;
export type IgnoredDependency = NonNullable<Mod["ignoredDependencies"]>[number];
export type DependencyLink = NonNullable<Mod["dependencyLinks"]>[number];
export type ModrinthDependency = NonNullable<
  ModrinthMeta["dependencies"]
>[number];
export type Collection = z.infer<typeof collectionSchema>;
export type BatchFile = z.infer<typeof batchFileSchema>;
export type Batch = z.infer<typeof batchSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type BatchContentRef = z.infer<typeof batchContentRefSchema>;
export type InboxFile = z.infer<typeof inboxFileSchema>;
export type InboxEntry = z.infer<typeof inboxEntrySchema>;
export type ContentItem = z.infer<typeof contentItemSchema>;
export type ContentVerification = NonNullable<
  ContentItem["manualVerification"]
>;
export type ContentFile = {
  version: 1;
  type: ContentType;
  items: ContentItem[];
};

export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`)
    .join("; ");
}

export function parseJsonFile(text: string, kind: "batches"): BatchFile;
export function parseJsonFile(
  text: string,
  kind: "modpack" | "mods",
): Modpack | Mod[];
export function parseJsonFile(
  text: string,
  kind: "modpack" | "mods" | "batches",
): Modpack | Mod[] | BatchFile {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const result =
    kind === "modpack"
      ? modpackSchema.safeParse(value)
      : kind === "batches"
        ? batchFileSchema.safeParse(value)
        : modsSchema.safeParse(value);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data;
}
