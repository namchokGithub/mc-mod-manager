export type Page = "preview" | "manage";

/**
 * Manage (the editor) exists only in `pnpm dev`. Production builds see `false` here, so Vite can
 * drop the editor code from the GitHub Pages bundle.
 */
export const MANAGE_ENABLED = import.meta.env.DEV;

/**
 * Maps a location hash to a page. Route hashes start with "#/"; any other hash, such as
 * "#collection", is an in-page anchor on Preview and is left alone. An unknown route, including
 * "#/manage" when Manage is disabled, returns `redirect: "#/"`.
 */
export function resolveRoute(
  hash: string,
  manageEnabled: boolean,
): { page: Page; redirect?: string } {
  if (!hash.startsWith("#/")) return { page: "preview" };
  const path = hash.slice(1).split(/[?#]/)[0] ?? "/";
  if (path === "/") return { page: "preview" };
  if (manageEnabled && (path === "/manage" || path.startsWith("/manage/")))
    return { page: "manage" };
  return { page: "preview", redirect: "#/" };
}
