import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import inboxJson from "../../public/data/mod-inbox.json";
import { withOrder } from "./batches";
import { checkCompatibility } from "./compatibility";
import {
  addInboxEntry,
  collectionMatch,
  inboxEntriesFromNames,
  inboxRepeats,
  promoteInbox,
} from "./inbox";
import { planningDashboard } from "./planningDashboard";
import { normalizeName, quickAddMods } from "./quickAdd";
import {
  collectionSchema,
  inboxFileSchema,
  modsSchema,
  type InboxEntry,
} from "./schema";
import { DRAFT_KEY, loadDraft, parseDraft } from "./storage";

const now = new Date("2026-10-17T08:00:00.000Z");
const collectionMods = quickAddMods(["Sodium", "Create"], []);

describe("inbox file", () => {
  it("accepts the published mod-inbox.json and fills omitted notes", () => {
    expect(inboxFileSchema.safeParse(inboxJson).success).toBe(true);
    const parsed = inboxFileSchema.parse({
      version: 1,
      entries: [{ id: "a", name: "A", createdAt: now.toISOString() }],
    });
    expect(parsed.entries[0]?.notes).toBe("");
  });

  it("rejects empty names, bad dates, and duplicate IDs", () => {
    const entry = {
      id: "a",
      name: "A",
      notes: "",
      createdAt: now.toISOString(),
    };
    expect(
      inboxFileSchema.safeParse({
        version: 1,
        entries: [{ ...entry, name: " " }],
      }).success,
    ).toBe(false);
    expect(
      inboxFileSchema.safeParse({
        version: 1,
        entries: [{ ...entry, createdAt: "today" }],
      }).success,
    ).toBe(false);
    expect(
      inboxFileSchema.safeParse({ version: 1, entries: [entry, entry] })
        .success,
    ).toBe(false);
  });

  it("loads collections and drafts that have no inbox", () => {
    const published = collectionSchema.parse({
      modpack: modpackJson,
      mods: modsJson,
    });
    expect(published.inbox).toEqual({ version: 1, entries: [] });
    const withInbox = {
      ...published,
      inbox: {
        version: 1 as const,
        entries: inboxEntriesFromNames(["Later"], [], now),
      },
    };
    const oldDraft = JSON.stringify({
      modpack: published.modpack,
      mods: published.mods,
    });
    expect(parseDraft(oldDraft, withInbox)?.inbox).toEqual(withInbox.inbox);
    const storage = {
      items: new Map([[DRAFT_KEY, oldDraft]]),
      getItem(key: string) {
        return this.items.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.items.set(key, value);
      },
      removeItem(key: string) {
        this.items.delete(key);
      },
    };
    expect(loadDraft(storage, withInbox).draft).toBeNull();
  });
});

describe("adding names to the inbox", () => {
  it("creates entries with stable unique IDs and a timestamp", () => {
    const first = inboxEntriesFromNames(["Create", "Create"], [], now);
    expect(first).toEqual([
      {
        id: "create",
        name: "Create",
        notes: "",
        createdAt: "2026-10-17T08:00:00.000Z",
      },
      {
        id: "create-2",
        name: "Create",
        notes: "",
        createdAt: "2026-10-17T08:00:00.000Z",
      },
    ]);
    expect(inboxEntriesFromNames(["Create"], first, now)[0]?.id).toBe(
      "create-3",
    );
  });

  it("finds repeats within the inbox and names already in the collection", () => {
    const entries = inboxEntriesFromNames(["JEI", "jei ", "Sodium"], [], now);
    expect([...inboxRepeats(entries)]).toEqual(["jei-2"]);
    expect(collectionMatch(entries[2]!, collectionMods)?.name).toBe("Sodium");
    expect(collectionMatch(entries[0]!, collectionMods)).toBeUndefined();
  });
});

describe("Add Row", () => {
  const existing = inboxEntriesFromNames(["Create"], [], now);

  it("adds one entry with a stable ID, timestamp, and notes", () => {
    const result = addInboxEntry(
      existing,
      { name: "  Farmer's   Delight ", notes: " Food " },
      now,
    );
    expect(result).toEqual({
      ok: true,
      entry: {
        id: "farmer-s-delight",
        name: "Farmer's Delight",
        notes: "Food",
        createdAt: now.toISOString(),
      },
      entries: [
        ...existing,
        expect.objectContaining({ id: "farmer-s-delight" }),
      ],
    });
    expect(
      result.ok &&
        inboxFileSchema.safeParse({ version: 1, entries: result.entries })
          .success,
    ).toBe(true);
  });

  it("refuses blank names, so empty rows are never stored", () => {
    expect(addInboxEntry(existing, { name: "   ", notes: "x" }, now)).toEqual({
      ok: false,
      error: "Enter a mod name.",
    });
  });

  it("refuses a name already in the inbox, ignoring case and spacing", () => {
    expect(normalizeName("  CREATE ")).toBe("create");
    expect(
      addInboxEntry(existing, { name: " create ", notes: "" }, now),
    ).toEqual({ ok: false, error: "Already in the inbox as “Create”." });
  });

  it("keeps existing entries and never touches the collection", () => {
    const before = JSON.stringify([existing, collectionMods]);
    const result = addInboxEntry(existing, { name: "Jade", notes: "" }, now);
    expect(result.ok && result.entries[0]).toBe(existing[0]);
    expect(JSON.stringify([existing, collectionMods])).toBe(before);
  });
});

describe("promoting to the collection", () => {
  const entries: InboxEntry[] = [
    ...inboxEntriesFromNames(["Farmer's Delight", "sodium", "Jade"], [], now),
  ].map((entry, index) =>
    index === 0 ? { ...entry, notes: " Check food " } : entry,
  );

  it("creates Planned mods with unknown metadata and keeps names and notes", () => {
    const result = promoteInbox(
      entries,
      ["farmer-s-delight", "jade"],
      collectionMods,
    );
    expect(result.promotedIds).toEqual(["farmer-s-delight", "jade"]);
    expect(result.created).toEqual([
      expect.objectContaining({
        id: "farmer-s-delight",
        name: "Farmer's Delight",
        status: "planned",
        category: "Uncategorized",
        version: "",
        sourceUrl: "",
        notes: "Check food",
      }),
      expect.objectContaining({ id: "jade", name: "Jade" }),
    ]);
    expect(result.created[0]?.modrinth).toBeUndefined();
    expect(
      modsSchema.safeParse([...collectionMods, ...result.created]).success,
    ).toBe(true);
  });

  it("skips names already in the collection and leaves them in the inbox", () => {
    const result = promoteInbox(entries, ["sodium"], collectionMods);
    expect(result.created).toEqual([]);
    expect(result.promotedIds).toEqual([]);
    expect(result.skipped).toEqual([
      {
        entry: expect.objectContaining({ id: "sodium" }),
        existingName: "Sodium",
      },
    ]);
  });

  it("does not create the same name twice in one promotion", () => {
    const twice = inboxEntriesFromNames(["Jade", "jade"], [], now);
    const result = promoteInbox(twice, ["jade", "jade-2"], []);
    expect(result.created.map((mod) => mod.name)).toEqual(["Jade"]);
    expect(result.skipped.map((item) => item.entry.id)).toEqual(["jade-2"]);
  });

  it("never changes the existing mods or the inbox", () => {
    const before = JSON.stringify([entries, collectionMods]);
    promoteInbox(
      entries,
      entries.map((entry) => entry.id),
      collectionMods,
      "Food",
    );
    expect(JSON.stringify([entries, collectionMods])).toBe(before);
  });

  it("promoted mods are Unknown and not in any batch", () => {
    const { created } = promoteInbox(entries, ["jade"], collectionMods);
    const mods = [...collectionMods, ...created];
    const pack = collectionSchema.parse({ modpack: modpackJson, mods });
    expect(checkCompatibility(mods, pack.modpack).get("jade")?.status).toBe(
      "unknown",
    );
    expect(planningDashboard(pack).unassigned.map((mod) => mod.id)).toContain(
      "jade",
    );
  });
});

describe("dashboard", () => {
  it("counts the inbox separately from every collection statistic", () => {
    const base = collectionSchema.parse({
      modpack: modpackJson,
      mods: collectionMods,
      batches: withOrder([]),
    });
    const withInbox = {
      ...base,
      inbox: {
        version: 1 as const,
        entries: inboxEntriesFromNames(["A", "B", "C"], [], now),
      },
    };
    const before = planningDashboard(base);
    const after = planningDashboard(withInbox);
    expect(after.inboxCount).toBe(3);
    const { inboxCount: _a, ...restBefore } = before;
    const { inboxCount: _b, ...restAfter } = after;
    void _a;
    void _b;
    expect(restAfter).toEqual(restBefore);
  });
});
