import { z } from "zod";
import { isPublicAssetPath } from "./heroImage";

const optionalUrl = z.union([
  z
    .url()
    .refine(
      (value) => value.startsWith("https://") || value.startsWith("http://"),
      "Use an http or https URL",
    ),
  z.literal(""),
]);
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

export const modSchema = z.object({
  id: z.string().trim().min(1, "ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  version: z.string(),
  category: z.string().trim().min(1, "Category is required"),
  tags: z.array(z.string().trim().min(1)),
  status: z.enum(["planned", "testing", "installed", "disabled", "removed"]),
  side: z.enum(["client", "server", "both"]),
  source: z.enum(["Modrinth", "CurseForge", "GitHub", "Other"]),
  sourceUrl: optionalUrl,
  description: z.string(),
  dependencies: z.array(z.string().trim().min(1)),
  notes: z.string(),
  imageUrl: optionalUrl,
  modrinth: modrinthMetaSchema.optional(),
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

export const collectionSchema = z.object({
  modpack: modpackSchema,
  mods: modsSchema,
});

export type Modpack = z.infer<typeof modpackSchema>;
export type Mod = z.infer<typeof modSchema>;
export type ModrinthMeta = z.infer<typeof modrinthMetaSchema>;
export type ModrinthDependency = NonNullable<
  ModrinthMeta["dependencies"]
>[number];
export type Collection = z.infer<typeof collectionSchema>;

export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "file"}: ${issue.message}`)
    .join("; ");
}

export function parseJsonFile(
  text: string,
  kind: "modpack" | "mods",
): Modpack | Mod[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  const result =
    kind === "modpack"
      ? modpackSchema.safeParse(value)
      : modsSchema.safeParse(value);
  if (!result.success) throw new Error(formatValidationError(result.error));
  return result.data;
}
