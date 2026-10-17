import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import type { ZodType } from "zod";
import { serializeJson } from "../src/lib/json";
import { SAVE_ENDPOINT, SAVE_HEADER } from "../src/lib/localSaveProtocol";
import {
  formatValidationError,
  modpackSchema,
  modsSchema,
  batchFileSchema,
  emptyBatchFile,
} from "../src/lib/schema";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function fingerprint(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Returns why a request must be refused, or null when it may save. */
export function untrustedReason(request: {
  method?: string;
  remoteAddress?: string;
  origin?: string;
  host?: string;
  marker?: string;
  contentType?: string;
}): string | null {
  if (request.method !== "POST") return "Only POST requests can save.";
  if (!request.remoteAddress || !LOOPBACK_ADDRESSES.has(request.remoteAddress))
    return "Saving is only allowed from this computer.";
  if (request.marker !== "1") return "The save request is missing its header.";
  if (!request.contentType?.toLowerCase().startsWith("application/json"))
    return "The save request must be JSON.";
  if (!request.origin || !request.host)
    return "The save request has no origin.";
  let origin: URL;
  try {
    origin = new URL(request.origin);
  } catch {
    return "The save request has an invalid origin.";
  }
  if (origin.host !== request.host)
    return "Requests from other sites cannot save.";
  if (!LOOPBACK_HOSTNAMES.has(origin.hostname))
    return "Only localhost pages can save.";
  return null;
}

function diskFingerprint(text: string | null, schema: ZodType): string | null {
  if (text === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text));
    return parsed.success ? fingerprint(serializeJson(parsed.data)) : null;
  } catch {
    return null;
  }
}

export type CurrentFiles = {
  modpack: string | null;
  mods: string | null;
  batches?: string | null;
};
export type SavePlan = {
  status: number;
  body: Record<string, unknown>;
  /** Present only when the files should be written; `batches` only when the request has a plan. */
  files?: { modpack: string; mods: string; batches?: string };
};

// A missing batches.json is the same as an empty build plan.
function batchesFingerprint(text: string | null | undefined): string | null {
  return text === null || text === undefined
    ? fingerprint(serializeJson(emptyBatchFile()))
    : diskFingerprint(text, batchFileSchema);
}

/**
 * Validates a save request against the shared schemas and the files currently on disk.
 * Pure: it decides what to write but never touches the file system.
 */
export function planSave(input: unknown, current: CurrentFiles): SavePlan {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return {
      status: 400,
      body: { error: "The request must be a JSON object." },
    };
  const request = input as {
    modpack?: unknown;
    mods?: unknown;
    batches?: unknown;
    baseline?: { modpack?: unknown; mods?: unknown; batches?: unknown };
    force?: unknown;
  };
  const modpack = modpackSchema.safeParse(request.modpack);
  if (!modpack.success)
    return {
      status: 400,
      body: { error: `modpack.json: ${formatValidationError(modpack.error)}` },
    };
  const mods = modsSchema.safeParse(request.mods);
  if (!mods.success)
    return {
      status: 400,
      body: { error: `mods.json: ${formatValidationError(mods.error)}` },
    };
  const batches =
    request.batches === undefined
      ? undefined
      : batchFileSchema.safeParse(request.batches);
  if (batches && !batches.success)
    return {
      status: 400,
      body: { error: `batches.json: ${formatValidationError(batches.error)}` },
    };
  if (request.force !== true) {
    const disk = {
      modpack: diskFingerprint(current.modpack, modpackSchema),
      mods: diskFingerprint(current.mods, modsSchema),
    };
    if (
      !disk.modpack ||
      !disk.mods ||
      request.baseline?.modpack !== disk.modpack ||
      request.baseline?.mods !== disk.mods ||
      (batches !== undefined &&
        request.baseline?.batches !== batchesFingerprint(current.batches))
    )
      return {
        status: 409,
        body: {
          error: "conflict",
          message:
            "The JSON files on disk changed since this page loaded them, or could not be read.",
        },
      };
  }
  const files = {
    modpack: serializeJson(modpack.data),
    mods: serializeJson(mods.data),
    ...(batches && { batches: serializeJson(batches.data) }),
  };
  return {
    status: 200,
    body: {
      ok: true,
      modpack: modpack.data,
      mods: mods.data,
      ...(batches && { batches: batches.data }),
      fingerprints: {
        modpack: fingerprint(files.modpack),
        mods: fingerprint(files.mods),
      },
    },
    files,
  };
}

/**
 * Writes every file to a temporary sibling first, then renames each into place. If any temporary
 * write fails, no target is touched.
 */
export async function commitFiles(
  writes: { target: string; text: string }[],
): Promise<void> {
  const staged: { target: string; temp: string }[] = [];
  try {
    for (const { target, text } of writes) {
      const temp = path.join(
        path.dirname(target),
        `.${path.basename(target)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
      );
      staged.push({ target, temp });
      const handle = await open(temp, "wx");
      try {
        await handle.writeFile(text, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
  } catch (error) {
    await Promise.all(staged.map(({ temp }) => rm(temp, { force: true })));
    throw error;
  }
  for (const { target, temp } of staged) await rename(temp, target);
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too-large"));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

/**
 * Dev-only endpoint that writes public/data/modpack.json, mods.json, and batches.json. `apply: "serve"` keeps it
 * out of production builds, and the target paths are fixed here, never taken from the client.
 */
export function localJsonSave(): Plugin {
  return {
    name: "mc-mod-manager:local-json-save",
    apply: "serve",
    configureServer(server) {
      const dataDir = path.join(server.config.publicDir, "data");
      const targets = {
        modpack: path.join(dataDir, "modpack.json"),
        mods: path.join(dataDir, "mods.json"),
        batches: path.join(dataDir, "batches.json"),
      };
      let saving = false;
      server.middlewares.use(SAVE_ENDPOINT, (request, response) => {
        void (async () => {
          const reason = untrustedReason({
            method: request.method,
            remoteAddress: request.socket.remoteAddress,
            origin: request.headers.origin,
            host: request.headers.host,
            marker: request.headers[SAVE_HEADER] as string | undefined,
            contentType: request.headers["content-type"],
          });
          if (reason) return send(response, 403, { error: reason });
          if (saving)
            return send(response, 429, {
              error: "Another save is still in progress.",
            });
          saving = true;
          try {
            let input: unknown;
            try {
              input = JSON.parse(await readBody(request));
            } catch (error) {
              return send(
                response,
                error instanceof Error && error.message === "too-large"
                  ? 413
                  : 400,
                {
                  error:
                    error instanceof Error && error.message === "too-large"
                      ? "The data is too large to save."
                      : "The request body is not valid JSON.",
                },
              );
            }
            const plan = planSave(input, {
              modpack: await readOptional(targets.modpack),
              mods: await readOptional(targets.mods),
              batches: await readOptional(targets.batches),
            });
            if (plan.files)
              await commitFiles([
                { target: targets.mods, text: plan.files.mods },
                { target: targets.modpack, text: plan.files.modpack },
                ...(plan.files.batches === undefined
                  ? []
                  : [{ target: targets.batches, text: plan.files.batches }]),
              ]);
            send(response, plan.status, plan.body);
          } catch (error) {
            server.config.logger.error(
              `[local-json-save] ${error instanceof Error ? error.message : String(error)}`,
            );
            send(response, 500, {
              error:
                "The files could not be written. Check the dev server log.",
            });
          } finally {
            saving = false;
          }
        })();
      });
    },
  };
}
