// Shared by the dev server plugin (vite-plugins/localJsonSave.ts) and the Manage page.
export const SAVE_ENDPOINT = "/__mc-mod-manager/save-json";
/** Custom header that forces a CORS preflight, so other sites cannot post to the endpoint. */
export const SAVE_HEADER = "x-mc-mod-manager";

export type SaveFingerprints = { modpack: string; mods: string };
