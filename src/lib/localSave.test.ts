import { describe, expect, it, vi } from "vitest";
import modpackJson from "../../public/data/modpack.json";
import modsJson from "../../public/data/mods.json";
import { fingerprint, saveToLocalJson } from "./localSave";
import { SAVE_ENDPOINT, SAVE_HEADER } from "./localSaveProtocol";
import { collectionSchema } from "./schema";

const published = collectionSchema.parse({
  modpack: modpackJson,
  mods: modsJson,
});
const draft = {
  ...published,
  modpack: { ...published.modpack, name: "Draft name" },
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("saving to local JSON", () => {
  it("posts the draft with the header and baseline fingerprints", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      reply(200, { ok: true, modpack: draft.modpack, mods: draft.mods }),
    );
    const result = await saveToLocalJson(draft, published, false, fetchMock);
    expect(result).toEqual({ kind: "saved", collection: draft });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(SAVE_ENDPOINT);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get(SAVE_HEADER)).toBe("1");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      modpack: { name: "Draft name" },
      force: false,
      baseline: {
        modpack: await fingerprint(published.modpack),
        mods: await fingerprint(published.mods),
      },
    });
  });

  it("reports a conflict so the user can confirm an overwrite", async () => {
    const result = await saveToLocalJson(draft, published, false, async () =>
      reply(409, { error: "conflict", message: "Changed on disk." }),
    );
    expect(result).toEqual({ kind: "conflict", message: "Changed on disk." });
  });

  it("passes the force flag after confirmation", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      reply(200, { ok: true, modpack: draft.modpack, mods: draft.mods }),
    );
    await saveToLocalJson(draft, published, true, fetchMock);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).force).toBe(
      true,
    );
  });

  it("returns server validation errors", async () => {
    const result = await saveToLocalJson(draft, published, false, async () =>
      reply(400, { error: "mods.json: 0.id: Duplicate mod ID: x" }),
    );
    expect(result).toEqual({
      kind: "error",
      message: "mods.json: 0.id: Duplicate mod ID: x",
    });
  });

  it("explains when the dev server is not reachable", async () => {
    const result = await saveToLocalJson(draft, published, false, async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result.kind).toBe("error");
    expect(result.kind === "error" && result.message).toContain("pnpm dev");
  });

  it("handles non-JSON error pages and unexpected replies", async () => {
    const html = await saveToLocalJson(
      draft,
      published,
      false,
      async () => new Response("<h1>404</h1>", { status: 404 }),
    );
    expect(html).toEqual({
      kind: "error",
      message: "Saving failed (HTTP 404).",
    });
    const odd = await saveToLocalJson(draft, published, false, async () =>
      reply(200, { ok: true }),
    );
    expect(odd.kind).toBe("error");
  });
});
