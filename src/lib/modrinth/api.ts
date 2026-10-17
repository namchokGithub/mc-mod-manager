import { z } from "zod";

export const MODRINTH_API = "https://api.modrinth.com/v2";
const BULK_CHUNK = 50;

export type ModrinthErrorKind =
  "network" | "rate-limit" | "not-found" | "server" | "invalid-response";

export class ModrinthError extends Error {
  readonly kind: ModrinthErrorKind;
  readonly retryAfter?: number;

  constructor(kind: ModrinthErrorKind, message: string, retryAfter?: number) {
    super(message);
    this.name = "ModrinthError";
    this.kind = kind;
    this.retryAfter = retryAfter;
  }
}

const sideSchema = z.string().catch("unknown");

export const searchHitSchema = z.object({
  project_id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().catch(""),
  author: z.string().catch(""),
  icon_url: z.string().nullish(),
  categories: z.array(z.string()).catch([]),
  display_categories: z.array(z.string()).catch([]),
  versions: z.array(z.string()).catch([]),
  downloads: z.number().catch(0),
  client_side: sideSchema,
  server_side: sideSchema,
});

const searchResponseSchema = z.object({
  hits: z.array(searchHitSchema),
  offset: z.number(),
  limit: z.number(),
  total_hits: z.number(),
});

export const projectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().catch(""),
  icon_url: z.string().nullish(),
  categories: z.array(z.string()).catch([]),
  loaders: z.array(z.string()).catch([]),
  game_versions: z.array(z.string()).catch([]),
  client_side: sideSchema,
  server_side: sideSchema,
});

export const versionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string().catch(""),
  version_number: z.string(),
  version_type: z.string().catch("release"),
  game_versions: z.array(z.string()),
  loaders: z.array(z.string()),
  date_published: z.string().catch(""),
  // Kept strict: silently dropping dependencies could hide a missing requirement.
  dependencies: z.array(
    z.object({
      project_id: z.string().nullish(),
      version_id: z.string().nullish(),
      dependency_type: z.string(),
    }),
  ),
});

export type SearchHit = z.infer<typeof searchHitSchema>;
export type ProjectResponse = z.infer<typeof projectSchema>;
export type VersionResponse = z.infer<typeof versionSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;

/** Modrinth `project_type` search facet values used by this app. */
export type SearchProjectType = "mod" | "resourcepack" | "datapack" | "shader";

export type SearchParams = {
  query: string;
  /** Defaults to "mod". Data packs are found by the "datapack" facet even though their hits report "mod". */
  projectType?: SearchProjectType;
  gameVersion?: string;
  loader?: string;
  offset?: number;
  limit?: number;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function retryAfterSeconds(response: Response): number | undefined {
  const value = Number(
    response.headers.get("retry-after") ??
      response.headers.get("x-ratelimit-reset"),
  );
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function searchUrl({
  query,
  projectType = "mod",
  gameVersion,
  loader,
  offset = 0,
  limit = 20,
}: SearchParams): string {
  const facets: string[][] = [[`project_type:${projectType}`]];
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  if (loader) facets.push([`categories:${loader}`]);
  const params = new URLSearchParams({
    query: query.trim(),
    facets: JSON.stringify(facets),
    limit: String(limit),
    offset: String(offset),
  });
  return `${MODRINTH_API}/search?${params.toString()}`;
}

export function createModrinthClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
) {
  async function request<T>(
    url: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    requestBody?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(
        url,
        requestBody === undefined
          ? { signal, headers: { Accept: "application/json" } }
          : {
              signal,
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(requestBody),
            },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError")
        throw error;
      throw new ModrinthError(
        "network",
        "Could not reach Modrinth. Check your connection and try again.",
      );
    }
    if (response.status === 429) {
      const retryAfter = retryAfterSeconds(response);
      throw new ModrinthError(
        "rate-limit",
        retryAfter
          ? `Modrinth is rate limiting requests. Try again in ${retryAfter}s.`
          : "Modrinth is rate limiting requests. Try again shortly.",
        retryAfter,
      );
    }
    if (response.status === 404)
      throw new ModrinthError(
        "not-found",
        "Modrinth could not find that item.",
      );
    if (!response.ok)
      throw new ModrinthError(
        "server",
        `Modrinth returned an error (${response.status}). Try again later.`,
      );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ModrinthError(
        "invalid-response",
        "Modrinth sent a response that could not be read.",
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new ModrinthError(
        "invalid-response",
        "Modrinth sent data in an unexpected format.",
      );
    return parsed.data;
  }

  async function bulk<T>(
    path: "projects" | "versions",
    ids: string[],
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T[]> {
    const unique = [...new Set(ids)];
    const results: T[] = [];
    for (let index = 0; index < unique.length; index += BULK_CHUNK) {
      const chunk = unique.slice(index, index + BULK_CHUNK);
      const params = new URLSearchParams({ ids: JSON.stringify(chunk) });
      results.push(
        ...(await request(
          `${MODRINTH_API}/${path}?${params.toString()}`,
          z.array(schema),
          signal,
        )),
      );
    }
    return results;
  }

  return {
    search: (params: SearchParams, signal?: AbortSignal) =>
      request(searchUrl(params), searchResponseSchema, signal),
    project: (idOrSlug: string, signal?: AbortSignal) =>
      request(
        `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}`,
        projectSchema,
        signal,
      ),
    projectVersions: (
      idOrSlug: string,
      filters: { gameVersion?: string; loader?: string } = {},
      signal?: AbortSignal,
    ) => {
      const params = new URLSearchParams();
      if (filters.loader)
        params.set("loaders", JSON.stringify([filters.loader]));
      if (filters.gameVersion)
        params.set("game_versions", JSON.stringify([filters.gameVersion]));
      const query = params.toString();
      return request(
        `${MODRINTH_API}/project/${encodeURIComponent(idOrSlug)}/version${query ? `?${query}` : ""}`,
        z.array(versionSchema),
        signal,
      );
    },
    projects: (ids: string[], signal?: AbortSignal) =>
      bulk("projects", ids, projectSchema, signal),
    versions: (ids: string[], signal?: AbortSignal) =>
      bulk("versions", ids, versionSchema, signal),
    /** Looks up versions by SHA-1 file hash. Only the hashes are sent, never the files. */
    versionsByHashes: async (hashes: string[], signal?: AbortSignal) => {
      const unique = [...new Set(hashes)];
      const found: Record<string, VersionResponse> = {};
      for (let index = 0; index < unique.length; index += BULK_CHUNK)
        Object.assign(
          found,
          await request(
            `${MODRINTH_API}/version_files`,
            z.record(z.string(), versionSchema),
            signal,
            {
              hashes: unique.slice(index, index + BULK_CHUNK),
              algorithm: "sha1",
            },
          ),
        );
      return found;
    },
  };
}

export type ModrinthClient = ReturnType<typeof createModrinthClient>;

export const modrinth = createModrinthClient();
