import { describe, expect, it } from "vitest";
import { withOrder } from "./batches";
import {
  buildGuide,
  defaultGuideOptions,
  escapeMarkdown,
  guideFilename,
  safeUrl,
} from "./buildGuide";
import { emptyContent, type Batch, type Collection, type Mod } from "./schema";

const generatedAt = new Date("2026-10-17T12:00:00Z");

function mod(id: string, extra: Partial<Mod> = {}): Mod {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    version: "",
    category: "c",
    tags: [],
    status: "planned",
    side: "both",
    source: "CurseForge",
    sourceUrl: "",
    description: "",
    dependencies: [],
    notes: "",
    imageUrl: "",
    ...extra,
  };
}

const batch = (
  id: string,
  modIds: string[],
  extra: Partial<Batch> = {},
): Batch => ({
  id,
  name: id,
  description: "",
  order: 1,
  steps: [
    {
      id: "install",
      name: "Install",
      description: "",
      done: false,
      itemRefs: modIds.map((id) => ({ type: "mod" as const, id })),
    },
  ],
  ...extra,
});

function collection(mods: Mod[], batches: Batch[]): Collection {
  return {
    ...emptyContent(),
    modpack: {
      name: "Helloworld: Beyond the Descendant",
      description: "A fantasy pack.",
      version: "0.1.0",
      minecraftVersion: "26.1.2",
      modloader: "NeoForge",
      modloaderVersion: "",
      author: "",
      updatedAt: "2026-10-17",
      heroImageUrl: "",
    },
    mods,
    batches: withOrder(batches),
    inbox: { version: 1, entries: [] },
  };
}

const sodium = mod("sodium", {
  version: "0.6.0",
  source: "Modrinth",
  sourceUrl: "https://modrinth.com/mod/sodium",
  status: "installed",
  notes: "Client only.",
  modrinth: {
    projectId: "p-sodium",
    versionId: "v1",
    gameVersions: ["26.1.2"],
    loaders: ["neoforge"],
    dependencies: [],
  },
});
const addon = mod("addon", {
  modrinth: {
    projectId: "p-addon",
    versionId: "v2",
    dependencies: [
      {
        projectId: "p-geckolib",
        versionId: null,
        type: "required",
        name: "GeckoLib",
      },
      {
        projectId: "p-sodium",
        versionId: null,
        type: "optional",
        name: "Sodium",
      },
    ],
  },
});
const manual = mod("lithium");

const data = collection(
  [sodium, addon, manual],
  [
    batch("foundation", ["sodium", "lithium"], {
      name: "Foundation & Performance",
      description: "Install first.\nThen launch.",
      steps: [
        {
          id: "s1",
          name: "Launch Minecraft",
          description: "",
          done: true,
          itemRefs: [{ type: "mod", id: "sodium" }],
        },
        {
          id: "s2",
          name: "Create a test world",
          description: "",
          done: false,
          itemRefs: [{ type: "mod", id: "lithium" }],
        },
      ],
    }),
    batch("content", ["addon", "gone"], { name: "Content" }),
  ],
);

describe("Markdown guide", () => {
  const guide = buildGuide(data, defaultGuideOptions, generatedAt);

  it("starts with the modpack information", () => {
    expect(guide.startsWith("# Helloworld: Beyond the Descendant\n")).toBe(
      true,
    );
    expect(guide).toContain("- Minecraft: 26.1.2");
    expect(guide).toContain("- Modloader: NeoForge");
    expect(guide).toContain("- Generated: 2026-10-17");
    expect(guide).toContain("A fantasy pack.");
  });

  it("lists batches in order with mods as unchecked items and links", () => {
    expect(
      guide.indexOf("## Batch 1 — Foundation & Performance"),
    ).toBeLessThan(guide.indexOf("## Batch 2 — Content"));
    expect(guide).toContain(
      "- [ ] Sodium 0.6.0 — [Modrinth](https://modrinth.com/mod/sodium)",
    );
    expect(guide).toContain("- [ ] Lithium — CurseForge");
    expect(guide).toContain("  - Minecraft: 26.1.2 (Modrinth)");
    expect(guide).toContain("  - Modloaders: NeoForge (Modrinth)");
    expect(guide).toContain("  - Planning status: Installed");
    expect(guide).toContain("  - Notes: Client only.");
  });

  it("keeps the description's line breaks", () => {
    expect(guide).toContain("Install first.  \nThen launch.");
  });

  it("exports Steps in order and always unchecked", () => {
    const steps = guide.slice(guide.indexOf("### Installation steps"));
    expect(steps.indexOf("- [ ] Launch Minecraft")).toBeLessThan(
      steps.indexOf("- [ ] Create a test world"),
    );
    expect(guide).not.toContain("[x]");
    expect(data.batches.batches[0]?.steps[0]?.done).toBe(true);
  });

  it("reports dependency status and unknown metadata without inventing data", () => {
    expect(guide).toContain("- Sodium: no dependencies listed (Modrinth)");
    expect(guide).toContain(
      "- Lithium: Unknown — dependency metadata unavailable",
    );
    expect(guide).toContain(
      "  - Requires GeckoLib (p-geckolib) — Missing from the mod list",
    );
    expect(guide).toContain(
      "  - Optional Sodium (p-sodium) — Found (In Batch 1 (Foundation & Performance))",
    );
    expect(guide).not.toContain("undefined");
  });

  it("notes batch references to deleted mods", () => {
    expect(guide).toContain("Not in the mod list anymore: gone.");
  });

  it("is identical for identical data", () => {
    expect(buildGuide(data, defaultGuideOptions, generatedAt)).toBe(guide);
  });

  it("never changes the data", () => {
    const before = JSON.stringify(data);
    buildGuide(data, defaultGuideOptions, generatedAt);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("dependency warnings", () => {
  it("warns when a required dependency is only in a later batch", () => {
    const lib = mod("lib", {
      modrinth: { projectId: "p-lib", versionId: "v", dependencies: [] },
    });
    const user = mod("user", {
      modrinth: {
        projectId: "p-user",
        versionId: "v",
        dependencies: [
          {
            projectId: "p-lib",
            versionId: null,
            type: "required",
            name: "Lib",
          },
        ],
      },
    });
    const guide = buildGuide(
      collection(
        [lib, user],
        [batch("first", ["user"]), batch("second", ["lib"])],
      ),
      defaultGuideOptions,
      generatedAt,
    );
    expect(guide).toContain("Warning: only in a later batch");
  });
});

describe("options", () => {
  it("exports a minimal Batch and Step outline with mod categories", () => {
    const guide = buildGuide(
      data,
      { ...defaultGuideOptions, minimal: true },
      generatedAt,
    );

    expect(guide).toContain("## Batch 1 — Foundation & Performance");
    expect(guide).toContain("2 mods");
    expect(guide).toContain("### Launch Minecraft");
    expect(guide).toContain("1 mod");
    expect(guide).toContain("- Sodium — c");
    expect(guide).toContain("- Lithium — c");
    expect(guide).not.toContain("Helloworld: Beyond the Descendant");
    expect(guide).not.toContain("Dependencies");
    expect(guide).not.toContain("Installation steps");
  });

  it("exports one batch with its real number", () => {
    const guide = buildGuide(
      data,
      { ...defaultGuideOptions, batchId: "content" },
      generatedAt,
    );
    expect(guide).toContain("## Batch 2 — Content");
    // Other batches appear only as cross-batch references, not as sections.
    expect(guide).not.toContain("## Batch 1");
  });

  it("can leave out dependencies, notes, and checklists", () => {
    const guide = buildGuide(
      data,
      {
        ...defaultGuideOptions,
        includeDependencies: false,
        includeNotes: false,
        includeSteps: false,
      },
      generatedAt,
    );
    expect(guide).not.toContain("### Dependencies");
    expect(guide).not.toContain("Notes:");
    expect(guide).not.toContain("Installation steps");
    expect(guide).not.toContain("[ ]");
    expect(guide).toContain("- Lithium — CurseForge");
  });

  it("writes plain text without Markdown syntax", () => {
    const text = buildGuide(
      data,
      { ...defaultGuideOptions, format: "text" },
      generatedAt,
    );
    expect(text.startsWith("HELLOWORLD: BEYOND THE DESCENDANT\n=")).toBe(true);
    expect(text).toContain(
      "- [ ] Sodium 0.6.0 — Modrinth (https://modrinth.com/mod/sodium)",
    );
    expect(text).not.toContain("](");
    expect(text).not.toContain("\\[");
  });
});

describe("empty plans and batches", () => {
  it("says when there are no batches or no mods", () => {
    expect(
      buildGuide(collection([], []), defaultGuideOptions, generatedAt),
    ).toContain("This build plan has no batches yet.");
    const guide = buildGuide(
      collection([], [batch("empty", [])]),
      defaultGuideOptions,
      generatedAt,
    );
    expect(guide).toContain("0 mods");
    expect(guide).toContain("No mods in this batch yet.");
  });
});

describe("escaping and links", () => {
  it("escapes Markdown in user text", () => {
    expect(escapeMarkdown("*bold* [link](x) <b> # _u_")).toBe(
      "\\*bold\\* \\[link\\](x) \\<b\\> # \\_u\\_",
    );
    expect(escapeMarkdown("- not a list\n1. not ordered")).toBe(
      "\\- not a list\n1\\. not ordered",
    );
    const guide = buildGuide(
      collection(
        [mod("x", { name: "[Evil](javascript:alert)" })],
        [batch("b", ["x"])],
      ),
      defaultGuideOptions,
      generatedAt,
    );
    expect(guide).toContain("\\[Evil\\](javascript:alert)");
  });

  it("only links http and https URLs", () => {
    expect(safeUrl("https://www.curseforge.com/minecraft/mc-mods/sodium")).toBe(
      "https://www.curseforge.com/minecraft/mc-mods/sodium",
    );
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("not a url")).toBeNull();
    expect(safeUrl("")).toBeNull();
    expect(safeUrl("https://example.com/a(b)")).toBe(
      "https://example.com/a%28b%29",
    );
    const guide = buildGuide(
      collection(
        [mod("x", { sourceUrl: "ftp://files.example.com" })],
        [batch("b", ["x"])],
      ),
      defaultGuideOptions,
      generatedAt,
    );
    expect(guide).toContain("- [ ] X — CurseForge");
    expect(guide).not.toContain("ftp://");
  });
});

describe("file names", () => {
  it("makes safe, readable file names", () => {
    expect(guideFilename("Helloworld: Beyond the Descendant", "markdown")).toBe(
      "helloworld-beyond-the-descendant-build-guide.md",
    );
    expect(guideFilename("Pack", "text", "Batch 1 / Core")).toBe(
      "pack-batch-1-core-build-guide.txt",
    );
    expect(guideFilename("Caf\u00e9 ../../etc", "markdown")).toBe(
      "cafe-etc-build-guide.md",
    );
    expect(guideFilename("!!!", "markdown")).toBe("modpack-build-guide.md");
  });
});
