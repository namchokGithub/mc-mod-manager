import type { ContentType } from "./schema";

/** CurseForge's Minecraft URL categories for the content collections. */
export const curseForgeCategories: Record<string, ContentType> = {
  "texture-packs": "resourcepack",
  "data-packs": "datapack",
  shaders: "shader",
};

const categoryNames: Record<ContentType, string> = {
  resourcepack: "texture-packs",
  datapack: "data-packs",
  shader: "shaders",
};

// Other CurseForge Minecraft categories, named so the error can say where they belong.
const otherCategories: Record<string, string> = {
  "mc-mods": "a mod; add it to the Mod collection",
  modpacks: "a modpack",
  customization: "a customization project",
  worlds: "a world",
  "bukkit-plugins": "a Bukkit plugin",
  "mc-addons": "a Bedrock add-on",
};

const HOSTS = new Set(["www.curseforge.com", "curseforge.com"]);
const SLUG = /^[a-z0-9][a-z0-9_-]*$/i;

export type CurseForgeUrl = {
  /** The URL exactly as entered (trimmed). */
  url: string;
  /** https://www.curseforge.com/minecraft/<category>/<slug>, used to compare projects. */
  projectUrl: string;
  type: ContentType;
  slug: string;
  /** Only when the URL itself names a file (…/files/<id> or …/download/<id>). Not verified. */
  fileId?: string;
};

/**
 * Reads a CurseForge Minecraft project or file URL. Format only: nothing is fetched, so a valid
 * URL says nothing about versions, loaders, or whether the project exists.
 */
export function parseCurseForgeUrl(
  raw: string,
  expected?: ContentType,
): { ok: true; value: CurseForgeUrl } | { ok: false; error: string } {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      ok: false,
      error: "Enter a full CurseForge link starting with https://.",
    };
  }
  if (url.protocol !== "https:")
    return { ok: false, error: "CurseForge links must use https://." };
  if (!HOSTS.has(url.hostname.toLowerCase()) || url.port || url.username)
    return { ok: false, error: "This is not a curseforge.com link." };
  let parts: string[];
  try {
    parts = url.pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
  } catch {
    return { ok: false, error: "The link has invalid characters." };
  }
  const [game, category = "", slug = "", ...rest] = parts;
  if (game !== "minecraft" || !category || !slug)
    return {
      ok: false,
      error:
        "Use a CurseForge Minecraft project link, like https://www.curseforge.com/minecraft/shaders/<project>.",
    };
  const type = curseForgeCategories[category];
  if (!type)
    return {
      ok: false,
      error: otherCategories[category]
        ? `This link is for ${otherCategories[category]}.`
        : `“${category}” is not a CurseForge resource pack, data pack, or shader category.`,
    };
  if (expected && type !== expected)
    return {
      ok: false,
      error: `This is a CurseForge ${category} link; this collection expects ${categoryNames[expected]}.`,
    };
  if (!SLUG.test(slug))
    return { ok: false, error: "The project part of the link is not valid." };
  const [section, id] = rest;
  const fileId =
    (section === "files" || section === "download") && id && /^\d+$/.test(id)
      ? id
      : undefined;
  return {
    ok: true,
    value: {
      url: text,
      projectUrl: `https://www.curseforge.com/minecraft/${category}/${slug.toLowerCase()}`,
      type,
      slug: slug.toLowerCase(),
      ...(fileId && { fileId }),
    },
  };
}

/** A readable name suggestion from the slug; the user confirms or replaces it. */
export function nameFromSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
