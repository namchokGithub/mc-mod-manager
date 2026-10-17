import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { localJsonSave } from "./vite-plugins/localJsonSave";

export default defineConfig({
  // localJsonSave only runs with the dev server (apply: "serve").
  plugins: [react(), tailwindcss(), localJsonSave()],
  base: process.env.GITHUB_PAGES === "true" ? "/mc-mod-manager/" : "/",
});
