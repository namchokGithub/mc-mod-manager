import { batchMods, orderedBatches } from "./batches";
import {
  batchDependencyOverview,
  placementText,
  sourceLabels,
  type DependencyEntry,
} from "./dependencyOverview";
import { loaderLabel } from "./modrinth/versionFilters";
import {
  batchContent,
  batchCountText,
  contentKeyByType,
  installGuidance,
  planTypeLabels,
  type PlanItemType,
} from "./batchContent";
import { contentSourceLabels } from "./content";
import { packGroup, packGroupLabels, requiredByOthers } from "./requirement";
import {
  contentItemCompat,
  contentSourceText,
  contentVerificationText,
} from "./contentVerification";
import {
  contentTypes,
  modStatusLabels,
  type Batch,
  type Collection,
  type ContentItem,
  type ContentType,
  type Mod,
} from "./schema";

export type GuideFormat = "markdown" | "text";

export type GuideOptions = {
  /** null exports every batch; otherwise only the batch with this ID. */
  batchId: string | null;
  format: GuideFormat;
  includeDependencies: boolean;
  includeNotes: boolean;
  includeSteps: boolean;
  /** Exports only Batch/Step summaries and item names with their type or category. */
  minimal: boolean;
};

export const defaultGuideOptions: GuideOptions = {
  batchId: null,
  format: "markdown",
  includeDependencies: true,
  includeNotes: true,
  includeSteps: true,
  minimal: false,
};

type Part = string | { label: string; url: string };
type Node =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "item"; parts: Part[]; depth: number; checkbox: boolean };

/** Only absolute http(s) URLs become links; anything else is dropped. */
export function safeUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Parentheses would end a Markdown link early.
    return url.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
  } catch {
    return null;
  }
}

/** Escapes characters Markdown would treat as formatting in user text. */
export function escapeMarkdown(text: string): string {
  // Brackets are enough to stop links and images; #, +, -, = and "1." only matter at a line start.
  return text
    .replace(/[\\`*_[\]<>~]/g, "\\$&")
    .replace(/^(\s*)([-=#+])/gm, "$1\\$2")
    .replace(/^(\s*\d+)\./gm, "$1\\.");
}

/** "Helloworld: Beyond!" -> "helloworld-beyond"; never empty. */
export function guideFilename(
  modpackName: string,
  format: GuideFormat,
  batchName?: string,
): string {
  const slug = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "");
  const base = [slug(modpackName) || "modpack", batchName && slug(batchName)]
    .filter(Boolean)
    .join("-");
  return `${base}-build-guide.${format === "markdown" ? "md" : "txt"}`;
}

function supportLines(mod: Mod): string[] {
  const lines: string[] = [];
  const meta = mod.modrinth;
  const file =
    mod.file?.format && mod.file.format !== "filename" ? mod.file : undefined;
  const manual = mod.manualCompatibility;
  if (meta?.versionId && meta.gameVersions?.length)
    lines.push(`Minecraft: ${meta.gameVersions.join(", ")} (Modrinth)`);
  else if (file?.minecraftRange)
    lines.push(`Minecraft: ${file.minecraftRange} (Local JAR)`);
  else if (manual?.gameVersions.length)
    lines.push(
      `Minecraft: ${manual.gameVersions.join(", ")} (manual, not verified)`,
    );
  if (meta?.versionId && meta.loaders?.length)
    lines.push(
      `Modloaders: ${meta.loaders.map(loaderLabel).join(", ")} (Modrinth)`,
    );
  else if (file?.loaders?.length && !file.loadersInferred)
    lines.push(
      `Modloaders: ${file.loaders.map(loaderLabel).join(", ")} (Local JAR)`,
    );
  else if (manual?.loaders.length)
    lines.push(
      `Modloaders: ${manual.loaders.map(loaderLabel).join(", ")} (manual, not verified)`,
    );
  return lines;
}

/** Details for a resource pack, data pack, or shader; never claims more than its verification. */
function contentLines(
  item: ContentItem,
  type: ContentType,
  packMinecraft: string,
): string[] {
  const compat = contentItemCompat(item, type, packMinecraft);
  const versions =
    compat.verification === "manual-verified" && compat.evidence
      ? compat.evidence.gameVersions
      : compat.verification === "modrinth"
        ? (item.modrinth?.gameVersions ?? [])
        : item.minecraftVersions;
  const lines = [
    `Minecraft: ${versions.length ? versions.join(", ") : "not listed"} — ${contentVerificationText(compat)}`,
  ];
  if (compat.verification === "manual-verified" && compat.evidence)
    lines.push(
      `Evidence: ${compat.evidence.evidenceUrl} (confirmed ${compat.evidence.verifiedAt.slice(0, 10)})`,
    );
  if (type === "shader")
    lines.push(
      `Shader runtime: ${item.modrinth?.loaders?.length ? `${item.modrinth.loaders.map(loaderLabel).join(", ")} listed, ` : ""}not checked`,
    );
  if (item.curseforge && item.curseforge.url !== item.sourceUrl)
    lines.push(`Also on CurseForge: ${item.curseforge.url}`);
  return lines;
}

const relationVerb = {
  required: "Requires",
  optional: "Optional",
  incompatible: "Incompatible with",
  discouraged: "Discourages",
} as const;

function dependencyText(entry: DependencyEntry): string {
  const name =
    entry.identifier && entry.identifier !== entry.label
      ? `${entry.label} (${entry.identifier})`
      : entry.label;
  const conflict =
    entry.relation === "incompatible" || entry.relation === "discouraged";
  let status: string;
  if (entry.status === "unresolved")
    status = `Unresolved: ${entry.reason ?? ""}`.trim();
  else if (entry.status === "missing")
    status = conflict ? "Not in the mod list" : "Missing from the mod list";
  else if (conflict) status = `Warning: in the pack (${placementText(entry)})`;
  else if (entry.laterOnly)
    status = `Warning: only in a later batch (${placementText(entry)})`;
  else
    status = `Found${entry.linked ? ", linked" : ""} (${placementText(entry)})`;
  return `${relationVerb[entry.relation]} ${name} — ${status}`;
}

function minimalBatchNodes(
  batch: Batch,
  position: number,
  collection: Collection,
): Node[] {
  const nodes: Node[] = [];
  const { mods } = batchMods(batch, collection.mods);
  const content = batchContent(batch, collection);
  const modsById = new Map(collection.mods.map((mod) => [mod.id, mod]));
  const contentByType = Object.fromEntries(
    contentTypes.map((type) => [
      type,
      new Map(
        collection[contentKeyByType[type]].items.map((item) => [item.id, item]),
      ),
    ]),
  ) as Record<ContentType, Map<string, ContentItem>>;

  nodes.push({
    kind: "heading",
    level: 2,
    text: `Batch ${position} — ${batch.name}`,
  });
  nodes.push({ kind: "paragraph", text: batchCountText(mods.length, content) });

  for (const step of batch.steps) {
    const stepBatch = { ...batch, steps: [step] };
    const stepMods = batchMods(stepBatch, collection.mods).mods;
    const stepContent = batchContent(stepBatch, collection);
    nodes.push({ kind: "heading", level: 3, text: step.name });
    nodes.push({
      kind: "paragraph",
      text: batchCountText(stepMods.length, stepContent),
    });
    for (const ref of step.itemRefs) {
      if (ref.type === "mod") {
        const mod = modsById.get(ref.id);
        nodes.push({
          kind: "item",
          depth: 0,
          checkbox: false,
          parts: [
            mod
              ? `${mod.name} — ${mod.category}`
              : `${ref.id} — Mod (not in collection)`,
          ],
        });
        continue;
      }
      const item = contentByType[ref.type].get(ref.id);
      nodes.push({
        kind: "item",
        depth: 0,
        checkbox: false,
        parts: [
          item
            ? `${item.name} — ${planTypeLabels[ref.type].one}`
            : `${ref.id} — ${planTypeLabels[ref.type].one} (not in collection)`,
        ],
      });
    }
  }
  return nodes;
}

function batchNodes(
  batch: Batch,
  position: number,
  collection: Collection,
  options: GuideOptions,
): Node[] {
  const nodes: Node[] = [];
  const { mods, missing } = batchMods(batch, collection.mods);
  nodes.push({
    kind: "heading",
    level: 2,
    text: `Batch ${position} — ${batch.name}`,
  });
  if (batch.description)
    nodes.push({ kind: "paragraph", text: batch.description });
  const content = batchContent(batch, collection);
  nodes.push({ kind: "paragraph", text: batchCountText(mods.length, content) });

  const pushMod = (mod: Mod, reason?: string) => {
    const url = safeUrl(mod.sourceUrl);
    nodes.push({
      kind: "item",
      depth: 0,
      checkbox: options.includeSteps,
      parts: [
        mod.version ? `${mod.name} ${mod.version}` : mod.name,
        " — ",
        url ? { label: mod.source, url } : mod.source,
      ],
    });
    const details = [
      ...(reason ? [`Review: ${reason}`] : []),
      ...supportLines(mod),
      `Planning status: ${modStatusLabels[mod.status]}`,
      ...(options.includeNotes && mod.notes.trim()
        ? [`Notes: ${mod.notes.trim()}`]
        : []),
    ];
    for (const detail of details)
      nodes.push({ kind: "item", depth: 1, checkbox: false, parts: [detail] });
  };
  // Batch order and mod order are kept; mods are only split by installation requirement.
  const requiredBy = requiredByOthers(collection.mods);
  const grouped = mods.map((mod) => ({ mod, ...packGroup(mod, requiredBy) }));
  if (grouped.every((item) => item.group === "required")) {
    // All required (including every mod saved before requirements existed): unchanged layout.
    nodes.push({ kind: "heading", level: 3, text: "Mods" });
    if (!mods.length)
      nodes.push({ kind: "paragraph", text: "No mods in this batch yet." });
    for (const mod of mods) pushMod(mod);
  } else
    for (const group of ["required", "optional", "review"] as const) {
      const items = grouped.filter((item) => item.group === group);
      if (!items.length) continue;
      nodes.push({ kind: "heading", level: 3, text: packGroupLabels[group] });
      if (group === "optional")
        nodes.push({
          kind: "paragraph",
          text: "Optional in this pack. Leave one out only where the configuration and other mods' dependencies allow it.",
        });
      if (group === "review")
        nodes.push({
          kind: "paragraph",
          text: "Check these before deciding whether to install them.",
        });
      for (const item of items) pushMod(item.mod, item.reason);
    }
  if (missing.length)
    nodes.push({
      kind: "paragraph",
      text: `Not in the mod list anymore: ${missing.join(", ")}.`,
    });

  for (const type of contentTypes) {
    const { items, missing: gone } = content[type];
    if (!items.length && !gone.length) continue;
    nodes.push({ kind: "heading", level: 3, text: planTypeLabels[type].many });
    for (const item of items) {
      const url = safeUrl(item.sourceUrl);
      const source = contentSourceText(item, contentSourceLabels);
      nodes.push({
        kind: "item",
        depth: 0,
        checkbox: options.includeSteps,
        parts: [
          item.version ? `${item.name} ${item.version}` : item.name,
          " — ",
          url ? { label: source, url } : source,
        ],
      });
      const details = [
        ...contentLines(item, type, collection.modpack.minecraftVersion),
        `Planning status: ${item.status}`,
        ...(options.includeNotes && item.notes.trim()
          ? [`Notes: ${item.notes.trim()}`]
          : []),
      ];
      for (const detail of details)
        nodes.push({
          kind: "item",
          depth: 1,
          checkbox: false,
          parts: [detail],
        });
    }
    if (gone.length)
      nodes.push({
        kind: "paragraph",
        text: `No longer in the ${planTypeLabels[type].many.toLowerCase()} list: ${gone.join(", ")}.`,
      });
  }

  if (options.includeDependencies) {
    nodes.push({ kind: "heading", level: 3, text: "Dependencies" });
    if (contentTypes.some((type) => content[type].items.length))
      nodes.push({
        kind: "paragraph",
        text: "Checked for mods only. Resource packs, data packs, and shaders are not part of dependency checks.",
      });
    const overview = batchDependencyOverview(
      batch.id,
      collection.batches,
      collection.mods,
    );
    if (!overview.mods.length)
      nodes.push({ kind: "paragraph", text: "No mods to check." });
    for (const item of overview.mods) {
      if (item.source === "unknown") {
        nodes.push({
          kind: "item",
          depth: 0,
          checkbox: false,
          parts: [
            `${item.mod.name}: Unknown — dependency metadata unavailable`,
          ],
        });
        continue;
      }
      const source =
        item.source === "manual"
          ? "manual, not verified"
          : sourceLabels[item.source];
      if (!item.entries.length) {
        nodes.push({
          kind: "item",
          depth: 0,
          checkbox: false,
          parts: [`${item.mod.name}: no dependencies listed (${source})`],
        });
        continue;
      }
      nodes.push({
        kind: "item",
        depth: 0,
        checkbox: false,
        parts: [`${item.mod.name} (${source}):`],
      });
      // Required first, then optional, then conflicts; within a group, metadata order.
      const rank = {
        required: 0,
        optional: 1,
        incompatible: 2,
        discouraged: 2,
      };
      const entries = [...item.entries].sort(
        (a, b) => rank[a.relation] - rank[b.relation],
      );
      for (const entry of entries)
        nodes.push({
          kind: "item",
          depth: 1,
          checkbox: false,
          parts: [dependencyText(entry)],
        });
    }
  }

  // Typical locations only, for the kinds of content in this batch.
  const present: PlanItemType[] = [
    ...(mods.length ? (["mod"] as const) : []),
    ...contentTypes.filter((type) => content[type].items.length),
  ];
  if (present.length) {
    nodes.push({ kind: "heading", level: 3, text: "Installation notes" });
    for (const type of present)
      nodes.push({
        kind: "item",
        depth: 0,
        checkbox: false,
        parts: [installGuidance[type]],
      });
    nodes.push({
      kind: "paragraph",
      text: "These are typical locations, not guarantees. Follow each project's own instructions where they differ.",
    });
  }

  if (options.includeSteps && batch.steps.length) {
    nodes.push({ kind: "heading", level: 3, text: "Installation steps" });
    // Exported unchecked: the guide is for a future install, not a copy of planning progress.
    for (const step of batch.steps) {
      nodes.push({
        kind: "item",
        depth: 0,
        checkbox: true,
        parts: [step.name],
      });
      if (step.description)
        nodes.push({ kind: "paragraph", text: step.description });
    }
  }
  return nodes;
}

function render(nodes: Node[], format: GuideFormat): string {
  const lines: string[] = [];
  const markdown = format === "markdown";
  const inline = (part: Part) =>
    typeof part === "string"
      ? markdown
        ? escapeMarkdown(part)
        : part
      : markdown
        ? `[${escapeMarkdown(part.label)}](${part.url})`
        : `${part.label} (${part.url})`;
  let previous: Node["kind"] | null = null;
  for (const node of nodes) {
    if (node.kind !== "item" || previous !== "item") {
      if (lines.length) lines.push("");
    }
    if (node.kind === "heading") {
      if (markdown)
        lines.push(`${"#".repeat(node.level)} ${escapeMarkdown(node.text)}`);
      else {
        const text = node.level === 3 ? node.text : node.text.toUpperCase();
        lines.push(text, (node.level === 1 ? "=" : "-").repeat(text.length));
      }
    } else if (node.kind === "paragraph") {
      // Keep the author's line breaks: hard breaks in Markdown, plain lines in text.
      const text = node.text.split(/\r?\n/).map((line) => line.trim());
      lines.push(
        ...(markdown
          ? text.map((line, index) =>
              index < text.length - 1 && line
                ? `${escapeMarkdown(line)}  `
                : escapeMarkdown(line),
            )
          : text),
      );
    } else {
      const indent = "  ".repeat(node.depth);
      const box = node.checkbox ? "[ ] " : "";
      const text = node.parts.map(inline).join("");
      const [first = "", ...rest] = text.split(/\r?\n/);
      lines.push(`${indent}- ${box}${first}`);
      for (const line of rest) lines.push(`${indent}  ${line}`);
    }
    previous = node.kind;
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Builds the installation guide from current data. Pure and read-only: it never changes
 * mods, batches, or Step progress.
 */
export function buildGuide(
  collection: Collection,
  options: GuideOptions,
  generatedAt = new Date(),
): string {
  const { modpack } = collection;
  const all = orderedBatches(collection.batches);
  const selected = options.batchId
    ? all.filter((batch) => batch.id === options.batchId)
    : all;
  if (options.minimal) {
    const nodes = selected.flatMap((batch) =>
      minimalBatchNodes(batch, all.indexOf(batch) + 1, collection),
    );
    return render(
      nodes.length
        ? nodes
        : [{ kind: "paragraph", text: "This build plan has no batches yet." }],
      options.format,
    );
  }
  const nodes: Node[] = [{ kind: "heading", level: 1, text: modpack.name }];
  const facts: string[] = [];
  if (modpack.minecraftVersion.trim())
    facts.push(`Minecraft: ${modpack.minecraftVersion.trim()}`);
  if (modpack.modloader.trim())
    facts.push(
      `Modloader: ${[modpack.modloader.trim(), modpack.modloaderVersion.trim()].filter(Boolean).join(" ")}`,
    );
  if (modpack.version.trim())
    facts.push(`Pack version: ${modpack.version.trim()}`);
  facts.push(`Generated: ${generatedAt.toISOString().slice(0, 10)}`);
  for (const fact of facts)
    nodes.push({ kind: "item", depth: 0, checkbox: false, parts: [fact] });
  if (modpack.description.trim())
    nodes.push({ kind: "paragraph", text: modpack.description.trim() });
  if (!selected.length)
    nodes.push({
      kind: "paragraph",
      text: "This build plan has no batches yet.",
    });
  for (const batch of selected)
    nodes.push(
      ...batchNodes(batch, all.indexOf(batch) + 1, collection, options),
    );
  return render(nodes, options.format);
}
