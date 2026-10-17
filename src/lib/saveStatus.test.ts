import { describe, expect, it } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import {
  deriveSaveStatus,
  hasUnsavedChanges,
  saveStatusLabels,
} from "./saveStatus";
import { collectionSchema } from "./schema";

const saved = collectionSchema.parse({ modpack: modpackJson, mods: modsJson });

describe("unsaved changes", () => {
  it("is false when the data matches the saved JSON", () => {
    expect(hasUnsavedChanges(structuredClone(saved), saved)).toBe(false);
  });

  it("is true after an edit, a deletion, or an imported replacement", () => {
    expect(
      hasUnsavedChanges(
        { ...saved, modpack: { ...saved.modpack, name: "Renamed" } },
        saved,
      ),
    ).toBe(true);
    expect(
      hasUnsavedChanges({ ...saved, mods: saved.mods.slice(1) }, saved),
    ).toBe(true);
  });

  it("is false again when an edit is reverted", () => {
    const edited = { ...saved, modpack: { ...saved.modpack, name: "Renamed" } };
    const reverted = {
      ...edited,
      modpack: { ...edited.modpack, name: saved.modpack.name },
    };
    expect(hasUnsavedChanges(reverted, saved)).toBe(false);
  });
});

describe("save status", () => {
  it("shows nothing on a fresh load without edits", () => {
    expect(deriveSaveStatus("idle", false)).toBeNull();
  });

  it("shows unsaved changes until the files are written", () => {
    expect(deriveSaveStatus("idle", true)).toBe("unsaved");
    expect(saveStatusLabels.unsaved).toBe("Unsaved changes");
  });

  it("shows saving while the write is in progress", () => {
    expect(deriveSaveStatus("saving", true)).toBe("saving");
    expect(saveStatusLabels.saving).toBe("Saving...");
  });

  it("shows saved locally only after a successful write with nothing pending", () => {
    expect(deriveSaveStatus("saved", false)).toBe("saved");
    expect(deriveSaveStatus("saved", true)).toBe("unsaved");
    expect(saveStatusLabels.saved).toBe("Saved locally");
  });

  it("keeps a failed save visible while the changes remain unsaved", () => {
    expect(deriveSaveStatus("failed", true)).toBe("failed");
    expect(saveStatusLabels.failed).toBe("Save failed");
    expect(deriveSaveStatus("failed", false)).toBeNull();
  });
});
