import { parseToml, type TomlTable, type TomlValue } from "./toml";
import { readTextEntries } from "./zip";

export type JarLoader = "fabric" | "quilt" | "forge" | "neoforge";
export type JarDependencyKind =
  "required" | "optional" | "incompatible" | "discouraged";
export type JarDependency = {
  modId: string;
  kind: JarDependencyKind;
  versionRange?: string;
};
export type MetadataFormat =
  | "fabric.mod.json"
  | "quilt.mod.json"
  | "neoforge.mods.toml"
  | "mods.toml"
  | "filename";

export type JarMetadata = {
  fileName: string;
  format: MetadataFormat;
  /** False when the archive itself could not be opened. */
  readable: boolean;
  modId?: string;
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  side: "client" | "server" | "both" | null;
  loaders: JarLoader[];
  /** True when the loader was guessed (plain mods.toml without a forge/neoforge dependency). */
  loadersInferred?: boolean;
  minecraftRange?: string;
  dependencies: JarDependency[];
  warnings: string[];
};

const FABRIC = "fabric.mod.json";
const QUILT = "quilt.mod.json";
const NEOFORGE_TOML = "META-INF/neoforge.mods.toml";
const FORGE_TOML = "META-INF/mods.toml";
const MANIFEST = "META-INF/MANIFEST.MF";

// Loader and runtime entries are requirements of the platform, not other mods in the pack.
const PLATFORM_IDS = new Set([
  "minecraft",
  "java",
  "fabricloader",
  "fabric-loader",
  "quilt_loader",
  "forge",
  "neoforge",
  "javafml",
]);

type Parsed = Omit<JarMetadata, "fileName" | "readable">;

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const isTable = (value: TomlValue | undefined): value is TomlTable =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isPlaceholder(value: string | undefined): boolean {
  return Boolean(value && /\$\{[^}]+\}/.test(value));
}

function httpUrl(value: unknown): string | undefined {
  const url = text(value);
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function parseManifest(source: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let last = "";
  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    // Manifest lines wrap at 72 bytes; continuation lines start with one space.
    if (line.startsWith(" ") && last)
      fields[last] = (fields[last] ?? "") + line.slice(1);
    else {
      const separator = line.indexOf(":");
      if (separator > 0) {
        last = line.slice(0, separator).trim();
        fields[last] = line.slice(separator + 1).trim();
      }
    }
  }
  return fields;
}

export function filenameHints(fileName: string): {
  name?: string;
  version?: string;
} {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.jar$/i, "");
  const match = base.match(/^(.+?)[-_ ]v?(\d[\w.+-]*)$/);
  const name = (match?.[1] ?? base).replace(/[-_]+/g, " ").trim();
  return { name: name || undefined, version: match?.[2] };
}

function fabricDependencies(
  value: unknown,
  kind: JarDependencyKind,
): JarDependency[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(
    ([modId, range]) => ({
      modId,
      kind,
      versionRange: Array.isArray(range)
        ? range.filter((item) => typeof item === "string").join(" || ")
        : text(range),
    }),
  );
}

function splitPlatform(dependencies: JarDependency[]): {
  dependencies: JarDependency[];
  minecraftRange?: string;
} {
  return {
    dependencies: dependencies.filter(
      (dependency) => !PLATFORM_IDS.has(dependency.modId),
    ),
    minecraftRange: dependencies.find(
      (dependency) =>
        dependency.modId === "minecraft" && dependency.kind === "required",
    )?.versionRange,
  };
}

export function parseFabricModJson(source: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new Error("fabric.mod.json is not valid JSON");
  }
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("fabric.mod.json is not an object");
  const data = json as Record<string, unknown>;
  const warnings: string[] = [];
  const modId = text(data.id);
  if (!modId) warnings.push("fabric.mod.json has no mod ID.");
  let version = text(data.version);
  if (isPlaceholder(version)) {
    warnings.push(`The version “${version}” was never filled in by the build.`);
    version = undefined;
  }
  const environment = text(data.environment);
  const contact =
    data.contact && typeof data.contact === "object"
      ? (data.contact as Record<string, unknown>)
      : {};
  const split = splitPlatform([
    ...fabricDependencies(data.depends, "required"),
    ...fabricDependencies(data.recommends, "optional"),
    ...fabricDependencies(data.suggests, "optional"),
    ...fabricDependencies(data.breaks, "incompatible"),
    ...fabricDependencies(data.conflicts, "discouraged"),
  ]);
  return {
    format: "fabric.mod.json",
    modId,
    name: text(data.name),
    version,
    description: text(data.description),
    homepage: httpUrl(contact.homepage) ?? httpUrl(contact.sources),
    side:
      environment === "client"
        ? "client"
        : environment === "server"
          ? "server"
          : environment === "*"
            ? "both"
            : null,
    loaders: ["fabric"],
    ...split,
    warnings,
  };
}

export function parseQuiltModJson(source: string): Parsed {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch {
    throw new Error("quilt.mod.json is not valid JSON");
  }
  const loader = (json as Record<string, unknown> | null)?.quilt_loader;
  if (!loader || typeof loader !== "object")
    throw new Error("quilt.mod.json has no quilt_loader section");
  const data = loader as Record<string, unknown>;
  const metadata =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : {};
  const contact =
    metadata.contact && typeof metadata.contact === "object"
      ? (metadata.contact as Record<string, unknown>)
      : {};
  const list = (value: unknown, kind: JarDependencyKind): JarDependency[] =>
    (Array.isArray(value) ? value : []).flatMap((item): JarDependency[] => {
      if (typeof item === "string") return [{ modId: item, kind }];
      if (!item || typeof item !== "object") return [];
      const entry = item as Record<string, unknown>;
      const modId = text(entry.id);
      if (!modId) return [];
      return [
        {
          modId,
          kind:
            kind === "required" && entry.optional === true ? "optional" : kind,
          versionRange: Array.isArray(entry.versions)
            ? entry.versions.join(" || ")
            : text(entry.versions),
        },
      ];
    });
  const warnings: string[] = [];
  let version = text(data.version);
  if (isPlaceholder(version)) {
    warnings.push(`The version “${version}” was never filled in by the build.`);
    version = undefined;
  }
  const environment = text(
    (json as Record<string, { environment?: unknown }>).minecraft?.environment,
  );
  return {
    format: "quilt.mod.json",
    modId: text(data.id),
    name: text(metadata.name),
    version,
    description: text(metadata.description),
    homepage: httpUrl(contact.homepage) ?? httpUrl(contact.sources),
    side:
      environment === "client"
        ? "client"
        : environment === "dedicated_server"
          ? "server"
          : environment === "*"
            ? "both"
            : null,
    loaders: ["quilt"],
    ...splitPlatform([
      ...list(data.depends, "required"),
      ...list(data.breaks, "incompatible"),
    ]),
    warnings,
  };
}

export function parseModsToml(
  source: string,
  format: "neoforge.mods.toml" | "mods.toml",
  manifest: Record<string, string> = {},
): Parsed {
  const doc = parseToml(source);
  const mods = Array.isArray(doc.mods) ? doc.mods.filter(isTable) : [];
  const mod = mods[0];
  if (!mod) throw new Error(`${format} has no [[mods]] entry`);
  const warnings: string[] = [];
  const modId = text(mod.modId);
  if (!modId) warnings.push(`${format} has no modId.`);
  if (mods.length > 1)
    warnings.push(
      `This JAR declares ${mods.length} mods; only the first (${modId ?? "unnamed"}) is imported.`,
    );

  let version = text(mod.version);
  if (version === "${file.jarVersion}")
    version = text(manifest["Implementation-Version"]);
  if (isPlaceholder(version) || (!version && text(mod.version))) {
    warnings.push("The version placeholder could not be resolved.");
    version = undefined;
  }

  const dependencyTables =
    isTable(doc.dependencies) && modId && Array.isArray(doc.dependencies[modId])
      ? (doc.dependencies[modId] as TomlValue[]).filter(isTable)
      : [];
  const all = dependencyTables.flatMap((entry): JarDependency[] => {
    const id = text(entry.modId);
    if (!id) return [];
    const type = text(entry.type)?.toLowerCase();
    const kind: JarDependencyKind =
      type === "required" ||
      type === "optional" ||
      type === "incompatible" ||
      type === "discouraged"
        ? type
        : entry.mandatory === false
          ? "optional"
          : "required";
    return [{ modId: id, kind, versionRange: text(entry.versionRange) }];
  });

  const loaders: JarLoader[] = [];
  if (all.some((dependency) => dependency.modId === "neoforge"))
    loaders.push("neoforge");
  if (all.some((dependency) => dependency.modId === "forge"))
    loaders.push("forge");
  const loadersInferred = !loaders.length && format === "mods.toml";
  if (!loaders.length) {
    loaders.push(format === "neoforge.mods.toml" ? "neoforge" : "forge");
    if (loadersInferred)
      warnings.push(
        "The loader was inferred from mods.toml; NeoForge 1.20.1 mods use the same file.",
      );
  }

  return {
    format,
    modId,
    name: text(mod.displayName),
    version,
    description: text(mod.description),
    homepage: httpUrl(mod.displayURL) ?? httpUrl(doc.displayURL),
    side: null,
    loaders,
    ...(loadersInferred && { loadersInferred }),
    ...splitPlatform(all),
    warnings,
  };
}

function fromFilename(
  fileName: string,
  readable: boolean,
  warnings: string[],
): JarMetadata {
  const hints = filenameHints(fileName);
  return {
    fileName,
    format: "filename",
    readable,
    name: hints.name,
    version: hints.version,
    side: null,
    loaders: [],
    dependencies: [],
    warnings: [
      ...warnings,
      "Name and version are guesses from the file name and are not verified.",
    ],
  };
}

/**
 * Reads mod metadata from a .jar without executing it. When a JAR ships metadata for several
 * loaders, the one matching `preferredLoader` becomes the primary entry.
 */
export async function parseJar(
  file: Blob,
  fileName: string,
  preferredLoader: JarLoader | null = null,
): Promise<JarMetadata> {
  let texts: Map<string, string>;
  try {
    texts = await readTextEntries(file, [
      FABRIC,
      QUILT,
      NEOFORGE_TOML,
      FORGE_TOML,
      MANIFEST,
    ]);
  } catch (error) {
    return fromFilename(fileName, false, [
      error instanceof Error ? error.message : "The file could not be read.",
    ]);
  }
  const manifest = parseManifest(texts.get(MANIFEST) ?? "");
  const parsers: [string, () => Parsed][] = [
    [
      NEOFORGE_TOML,
      () =>
        parseModsToml(
          texts.get(NEOFORGE_TOML)!,
          "neoforge.mods.toml",
          manifest,
        ),
    ],
    [
      FORGE_TOML,
      () => parseModsToml(texts.get(FORGE_TOML)!, "mods.toml", manifest),
    ],
    [FABRIC, () => parseFabricModJson(texts.get(FABRIC)!)],
    [QUILT, () => parseQuiltModJson(texts.get(QUILT)!)],
  ];
  const errors: string[] = [];
  const results: Parsed[] = [];
  for (const [name, parse] of parsers) {
    if (!texts.has(name)) continue;
    try {
      results.push(parse());
    } catch (error) {
      errors.push(
        `${name.replace("META-INF/", "")} could not be read: ${error instanceof Error ? error.message : "unknown error"}.`,
      );
    }
  }
  if (!results.length)
    return fromFilename(fileName, true, [
      ...errors,
      ...(errors.length
        ? []
        : [
            "No supported metadata file was found (fabric.mod.json, quilt.mod.json, mods.toml, neoforge.mods.toml).",
          ]),
    ]);

  const primary =
    results.find(
      (result) => preferredLoader && result.loaders.includes(preferredLoader),
    ) ?? results[0];
  if (!primary) return fromFilename(fileName, true, errors);
  const loaders = [...new Set(results.flatMap((result) => result.loaders))];
  const warnings = [...errors, ...primary.warnings];
  if (results.length > 1)
    warnings.push(
      `Contains metadata for ${loaders.join(", ")}; showing the ${primary.format} entry.`,
    );
  const metadata: JarMetadata = {
    ...primary,
    fileName,
    readable: true,
    loaders,
    // Any guessed loader in a multi-loader JAR makes the whole loader list a guess.
    ...(results.some((result) => result.loadersInferred) && {
      loadersInferred: true,
    }),
    warnings,
  };
  if (!metadata.version) {
    const hint = filenameHints(fileName).version;
    if (hint) {
      metadata.version = hint;
      metadata.warnings.push("Version taken from the file name; not verified.");
    }
  }
  return metadata;
}
