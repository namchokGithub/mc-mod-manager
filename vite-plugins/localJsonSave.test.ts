import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import modpackJson from "../public/data/modpack.json";
import modsJson from "../public/data/mods.json";
import { serializeJson } from "../src/lib/json";
import { fingerprint as clientFingerprint } from "../src/lib/localSave";
import { collectionSchema } from "../src/lib/schema";
import {
  commitFiles,
  fingerprint,
  planSave,
  untrustedReason,
} from "./localJsonSave";

const published = collectionSchema.parse({
  modpack: modpackJson,
  mods: modsJson,
});
const onDisk = {
  modpack: serializeJson(published.modpack),
  mods: serializeJson(published.mods),
};
const baseline = {
  modpack: fingerprint(onDisk.modpack),
  mods: fingerprint(onDisk.mods),
};

describe("trusted requests", () => {
  const ok = {
    method: "POST",
    remoteAddress: "127.0.0.1",
    origin: "http://localhost:5173",
    host: "localhost:5173",
    marker: "1",
    contentType: "application/json",
  };

  it("accepts a same-origin localhost request", () => {
    expect(untrustedReason(ok)).toBeNull();
    expect(
      untrustedReason({
        ...ok,
        remoteAddress: "::1",
        origin: "http://[::1]:5173",
        host: "[::1]:5173",
      }),
    ).toBeNull();
    expect(
      untrustedReason({
        ...ok,
        contentType: "application/json; charset=utf-8",
      }),
    ).toBeNull();
  });

  it("rejects other machines, sites, and methods", () => {
    expect(untrustedReason({ ...ok, method: "GET" })).toContain("POST");
    expect(untrustedReason({ ...ok, remoteAddress: "192.168.1.20" })).toContain(
      "this computer",
    );
    expect(
      untrustedReason({ ...ok, origin: "https://evil.example" }),
    ).toContain("other sites");
    expect(
      untrustedReason({
        ...ok,
        origin: "http://192.168.1.5:5173",
        host: "192.168.1.5:5173",
      }),
    ).toContain("localhost");
    expect(untrustedReason({ ...ok, origin: undefined })).toContain(
      "no origin",
    );
    expect(untrustedReason({ ...ok, origin: "not a url" })).toContain(
      "invalid",
    );
  });

  it("requires the custom header and a JSON body", () => {
    expect(untrustedReason({ ...ok, marker: undefined })).toContain("header");
    expect(untrustedReason({ ...ok, contentType: "text/plain" })).toContain(
      "JSON",
    );
  });
});

describe("planning a save", () => {
  const changed = {
    ...published,
    modpack: { ...published.modpack, name: "Renamed pack" },
  };

  it("writes validated data in the export format when the baseline matches", () => {
    const plan = planSave({ ...changed, baseline }, onDisk);
    expect(plan.status).toBe(200);
    expect(plan.files?.modpack).toBe(serializeJson(changed.modpack));
    expect(plan.files?.mods).toBe(serializeJson(changed.mods));
    expect(Object.keys(plan.files ?? {})).toEqual(["modpack", "mods"]);
    expect(plan.body).toMatchObject({
      ok: true,
      modpack: { name: "Renamed pack" },
    });
  });

  it("preserves notes and optional metadata", () => {
    const withMeta = {
      ...published,
      mods: [
        {
          ...published.mods[0]!,
          notes: "Keep me",
          modrinth: { projectId: "P", versionId: "V" },
          file: { name: "a.jar", sha1: "a".repeat(40) },
        },
      ],
    };
    const plan = planSave({ ...withMeta, baseline }, onDisk);
    expect(JSON.parse(plan.files?.mods ?? "[]")).toEqual(withMeta.mods);
  });

  it("keeps manually entered compatibility", () => {
    const manual = {
      ...published,
      mods: [
        {
          ...published.mods[0]!,
          notes: "From CurseForge",
          manualCompatibility: {
            gameVersions: ["26.1.2"],
            loaders: ["neoforge"],
          },
        },
      ],
    };
    const plan = planSave({ ...manual, baseline }, onDisk);
    expect(plan.status).toBe(200);
    expect(JSON.parse(plan.files?.mods ?? "[]")).toEqual(manual.mods);
  });

  it("rejects invalid data without writing", () => {
    const badPack = planSave(
      { ...published, modpack: { ...published.modpack, name: "" }, baseline },
      onDisk,
    );
    expect(badPack.status).toBe(400);
    expect(badPack.body.error).toContain("modpack.json");
    expect(badPack.files).toBeUndefined();
    const duplicate = planSave(
      { ...published, mods: [published.mods[0], published.mods[0]], baseline },
      onDisk,
    );
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error).toContain("Duplicate mod ID");
    expect(planSave([], onDisk).status).toBe(400);
    expect(planSave(null, onDisk).status).toBe(400);
  });

  it("reports a conflict when the files changed since the page loaded", () => {
    const edited = {
      ...onDisk,
      modpack: serializeJson({ ...published.modpack, author: "Someone else" }),
    };
    const plan = planSave({ ...changed, baseline }, edited);
    expect(plan.status).toBe(409);
    expect(plan.body.error).toBe("conflict");
    expect(plan.files).toBeUndefined();
  });

  it("treats missing, unreadable, or absent baselines as conflicts", () => {
    expect(
      planSave({ ...changed, baseline }, { ...onDisk, mods: null }).status,
    ).toBe(409);
    expect(
      planSave({ ...changed, baseline }, { ...onDisk, mods: "{oops" }).status,
    ).toBe(409);
    expect(planSave(changed, onDisk).status).toBe(409);
  });

  it("overwrites after explicit confirmation", () => {
    const plan = planSave(
      { ...changed, force: true },
      { modpack: null, mods: "{oops" },
    );
    expect(plan.status).toBe(200);
    expect(plan.files).toBeDefined();
  });

  it("uses the same fingerprint as the browser", async () => {
    expect(await clientFingerprint(published.modpack)).toBe(baseline.modpack);
    expect(await clientFingerprint(published.mods)).toBe(baseline.mods);
  });
});

describe("atomic file writes", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "mc-mod-manager-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("replaces both files and leaves no temporary files", async () => {
    const a = path.join(dir, "mods.json");
    const b = path.join(dir, "modpack.json");
    await writeFile(a, "old");
    await commitFiles([
      { target: a, text: "new mods\n" },
      { target: b, text: "new pack\n" },
    ]);
    expect(await readFile(a, "utf8")).toBe("new mods\n");
    expect(await readFile(b, "utf8")).toBe("new pack\n");
    expect((await readdir(dir)).sort()).toEqual(["modpack.json", "mods.json"]);
  });

  it("changes nothing when a temporary write fails", async () => {
    const a = path.join(dir, "mods.json");
    await writeFile(a, "old");
    await expect(
      commitFiles([
        { target: a, text: "new" },
        { target: path.join(dir, "missing-dir", "modpack.json"), text: "x" },
      ]),
    ).rejects.toThrow();
    expect(await readFile(a, "utf8")).toBe("old");
    expect(await readdir(dir)).toEqual(["mods.json"]);
  });
});
