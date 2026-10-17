import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import { collectionSchema, parseJsonFile, type Mod } from "./schema";
import {
  DRAFT_BACKUP_KEY,
  DRAFT_KEY,
  loadDraft,
  saveDraft,
  serializeJson,
} from "./storage";

const published = collectionSchema.parse({
  modpack: modpackJson,
  mods: modsJson,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const fullMod: Mod = {
  id: "iris-test-copy",
  name: "Iris",
  version: "1.7.6",
  category: "Visuals",
  tags: ["Shaders"],
  status: "installed",
  side: "client",
  source: "Modrinth",
  sourceUrl: "https://modrinth.com/mod/iris",
  description: "Shaders",
  dependencies: ["sodium"],
  notes: "Keep my note ✓",
  imageUrl: "",
  modrinth: {
    projectId: "YL57xq9U",
    slug: "iris",
    versionId: "s5eFLITc",
    versionNumber: "1.7.6+1.20.1",
    versionType: "release",
    datePublished: "2025-03-03T00:22:55Z",
    gameVersions: ["1.20.1"],
    loaders: ["fabric"],
    dependencies: [
      {
        projectId: "AANobbMI",
        versionId: null,
        type: "required",
        name: "Sodium",
      },
    ],
    syncedAt: "2026-10-17T00:00:00Z",
  },
  file: { name: "iris.jar", sha1: "a".repeat(40), modId: "iris" },
};

describe("draft loading", () => {
  it("returns a valid draft that differs from the published data", () => {
    const draft = { ...published, mods: [...published.mods, fullMod] };
    const storage = memoryStorage({ [DRAFT_KEY]: JSON.stringify(draft) });
    expect(loadDraft(storage, published)).toEqual({ draft, issue: null });
    expect(storage.items.has(DRAFT_KEY)).toBe(true);
  });

  it("returns nothing when no draft is stored", () => {
    expect(loadDraft(memoryStorage(), published)).toEqual({
      draft: null,
      issue: null,
    });
  });

  it("backs up an unreadable draft instead of letting it be overwritten", () => {
    const raw = JSON.stringify({ modpack: { name: "" }, mods: "broken" });
    const storage = memoryStorage({ [DRAFT_KEY]: raw });
    expect(loadDraft(storage, published)).toEqual({
      draft: null,
      issue: "backed-up",
    });
    expect(storage.items.get(DRAFT_BACKUP_KEY)).toBe(raw);
    expect(storage.items.has(DRAFT_KEY)).toBe(false);
  });

  it("leaves an unreadable draft in place when the backup cannot be written", () => {
    const storage = memoryStorage({ [DRAFT_KEY]: "{bad" });
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    expect(loadDraft(storage, published)).toEqual({
      draft: null,
      issue: "unreadable",
    });
    expect(storage.items.get(DRAFT_KEY)).toBe("{bad");
  });

  it("drops a draft identical to the published data", () => {
    const storage = memoryStorage({ [DRAFT_KEY]: JSON.stringify(published) });
    expect(loadDraft(storage, published)).toEqual({ draft: null, issue: null });
    expect(storage.items.has(DRAFT_KEY)).toBe(false);
  });

  it("copes with storage that cannot be read", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("SecurityError");
    };
    expect(loadDraft(storage, published)).toEqual({ draft: null, issue: null });
  });

  it("round-trips a saved draft with every optional field", () => {
    const storage = memoryStorage();
    const draft = { ...published, mods: [fullMod] };
    saveDraft(storage, draft);
    expect(loadDraft(storage, published).draft).toEqual(draft);
  });
});

describe("export and import", () => {
  it("re-imports exported mods without losing notes or metadata", () => {
    const mods = [...published.mods, fullMod];
    expect(parseJsonFile(serializeJson(mods), "mods")).toEqual(mods);
  });

  it("re-imports the exported modpack", () => {
    expect(parseJsonFile(serializeJson(published.modpack), "modpack")).toEqual(
      published.modpack,
    );
  });

  it("writes stable, readable JSON ending in a newline", () => {
    const text = serializeJson({ a: 1 });
    expect(text).toBe('{\n  "a": 1\n}\n');
  });

  it("rejects files of the wrong kind", () => {
    expect(() =>
      parseJsonFile(serializeJson(published.modpack), "mods"),
    ).toThrow();
    expect(() =>
      parseJsonFile(serializeJson(published.mods), "modpack"),
    ).toThrow();
  });
});
