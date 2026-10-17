# MC Mod Manager

[![Deploy](https://github.com/namchokGithub/mc-mod-manager/actions/workflows/deploy.yml/badge.svg)](https://github.com/namchokGithub/mc-mod-manager/actions/workflows/deploy.yml)
[![Live demo](https://img.shields.io/badge/demo-GitHub%20Pages-347A58)](https://namchokgithub.github.io/mc-mod-manager/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
![Minecraft](https://img.shields.io/badge/Minecraft-26.1.2-62B47A?logo=minecraft&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A static Minecraft modpack showcase with a local, in-browser editor. The public **Preview** page shows the pack and its mods; the **Manage** page lets you edit them, check compatibility, and prepare JSON files to publish. Manage is available only when running locally with `pnpm dev`; the GitHub Pages site shows Preview only. Everything runs in the browser with no backend.

![Sample](public/assets/readme/image-beautified.png)

> The sample data is for demonstration. Always check each mod's upstream page before installing.

## Features

- **Preview**: hero, pack stats, searchable and filterable mod grid or list, and a detail dialog with compatibility notes.
- **Manage**: add, edit, duplicate, and delete mods; edit pack settings; per-row status, compatibility, and update badges.
- **JSON import and export** for `modpack.json` and `mods.json`, validated before anything changes.
- **Local drafts** saved automatically in this browser's LocalStorage.
- **Modrinth search**: find a mod, pick a version, review a compatibility preview, then add it through the normal form.
- **Compatibility checker** (read-only): Minecraft version, modloader, required and incompatible dependencies, duplicate projects, and missing metadata. Results are Compatible, Warning, Incompatible, or Unknown.
- **Update checker**: compares each linked mod with the versions Modrinth lists for the pack. Results are Up to date, Update available, or Unknown.
- **JAR import**: reads `.jar` files or a mods folder locally, with an import preview and duplicate warnings.
- **Light and dark themes**: light by default, with a toggle in the header. The choice is remembered in this browser.
- **Toasts, confirmations, and reduced motion**: clear feedback for every change, confirmation before destructive actions, and animations that respect `prefers-reduced-motion`.

## Tech stack

React 19, TypeScript (strict), Vite, Tailwind CSS 4 with a custom stylesheet built on CSS variables, Radix Dialog, Select, and Popover with cmdk for searchable dropdowns, React Hook Form with Zod, Motion for React, lucide-react icons, and Vitest. No backend, database, or authentication.

Code layout:

- `src/app`: app shell, routing, data provider, toasts, and theme.
- `src/features`: the `preview`, `manage`, `modrinth` (search and version picker), and `import` (JAR) screens.
- `src/components`: shared UI such as dialogs, buttons, badges, and mod artwork.
- `src/lib`: logic without UI. This covers schemas (`schema.ts`), drafts and export (`storage.ts`), filtering, compatibility, updates, the Modrinth client (`modrinth/api.ts`, `mapping.ts`, `service.ts`), and JAR parsing (`jar/`).
- `src/styles.css`: all styling. Colors come from theme tokens on `:root` (light) and `:root[data-theme="dark"]`.

## Requirements

- Node.js 24 or newer
- pnpm 11.24.0 (`corepack enable` picks up the version in `package.json`)

## Local development

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL for Preview, or add `#/manage` for the editor. Manage and drafts exist only in development (`import.meta.env.DEV`). Production builds, including `pnpm preview`, show Preview only, redirect `#/manage` and other unknown routes to Preview, and always display the published JSON.

| Command          | What it does                                   |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Start the dev server                           |
| `pnpm lint`      | Run ESLint                                     |
| `pnpm typecheck` | Run the TypeScript project build in check mode |
| `pnpm test`      | Run the Vitest unit tests                      |
| `pnpm build`     | Type-check and build to `dist/`                |
| `pnpm preview`   | Serve the production build locally             |

## Data

Published data lives in two files:

- `public/data/modpack.json`: one object with `name`, `description`, `version`, `minecraftVersion`, `modloader`, `modloaderVersion`, `author`, `updatedAt` (`YYYY-MM-DD`), and `heroImageUrl`.
- `public/data/mods.json`: an array of mods. Each mod has `id` (unique), `name`, `version`, `category`, `tags`, `status` (`planned`, `testing`, `installed`, `disabled`, `removed`), `side` (`client`, `server`, `both`), `source` (`Modrinth`, `CurseForge`, `GitHub`, `Other`), `sourceUrl`, `description`, `dependencies`, `notes`, and `imageUrl`.

Optional fields added by later features. Files without them still load:

- `modrinth`: the linked project and selected version: `projectId`, `slug`, `versionId`, `versionNumber`, `versionType`, `datePublished`, `gameVersions`, `loaders`, `dependencies` (each with `projectId`, `versionId`, `type`, `name`), and `syncedAt`.
- `file`: the local `.jar` an entry came from: `name`, `sha1`, and `modId`.

`heroImageUrl` accepts an `http` or `https` URL, or a path under `public/assets/`, such as `public/assets/theme/winter_slime_adventure_in_the_snow.png`. Repository paths are resolved under the Vite base path. Commit the image along with the JSON. Leave it empty to use the built-in illustrated hero.

The schemas are in `src/lib/schema.ts`.

## Drafts, import, and export

**Editing in the browser never changes the published site.** The workflow is:

1. Run `pnpm dev` and edit in **Manage**. Changes are saved as a draft in this browser's LocalStorage about half a second after each change. Preview in the same browser shows the draft.
2. When ready, open **Manage → Data & export** and export `modpack.json` and `mods.json`.
3. Replace the files in `public/data/` with the exported ones, commit, and push. The site updates after the GitHub Pages workflow finishes.

Details:

- A draft belongs to one browser and one device. Clearing site data removes it. Other visitors always see the published files.
- **Reset draft** (with confirmation) discards the draft and returns to the published data.
- **Import** validates the file first. An invalid file changes nothing and shows why. A valid file asks for confirmation before it replaces the current mods or settings.
- If a stored draft can no longer be read, the app shows the published data, keeps the old draft under the LocalStorage key `mc-mod-manager:draft:v1:unreadable`, and tells you.
- A draft that matches the published data exactly is cleared on load, so the "Unpublished draft" badge disappears after you publish.
- The theme choice is stored separately under `mc-mod-manager:theme` and is never part of exported data.

## Modrinth integration

The app calls the public Modrinth API (`https://api.modrinth.com/v2`) directly from the browser. No key or account is needed.

- **Search Modrinth** (Manage) searches mods, optionally filtered by the pack's Minecraft version and loader. Search results are not treated as compatible. The version you pick is checked against its own metadata before you add it.
- **Update from Modrinth** (↻ on a row) links or changes the version. Only the version and the `modrinth` snapshot are replaced; your name, notes, status, side, and other edited fields are kept. Empty fields are filled.
- **Check compatibility** fetches current metadata for linked versions. **Check updates** fetches each project's compatible version list once, caches it for five minutes, and limits itself to four requests at a time.
- Updates are judged by version IDs, release channel, and publish date, never by comparing version strings. Ties, missing dates, and unclear ordering show as Unknown.
- Nothing is ever downloaded or installed, and the checkers never change your mods.

## Importing JAR files

**Manage → Import mods** accepts `.jar` files (multi-select or drag and drop) or a whole folder in Chromium-based browsers.

- Files are read only in your browser. They are never executed or uploaded. Only small metadata files inside each archive are read.
- Supported metadata: `fabric.mod.json`, `quilt.mod.json`, `META-INF/mods.toml`, and `META-INF/neoforge.mods.toml`. `${file.jarVersion}` is resolved from `META-INF/MANIFEST.MF`.
- Without metadata, the file name is used as an unverified hint.
- The preview flags duplicates (same file, same Modrinth project, same mod ID, or same name) and lets you choose what to import.
- **Match files** is optional. It sends only SHA-1 hashes to Modrinth to identify exact versions and attach verified metadata.

## Deploying to GitHub Pages

The site is served from `https://<username>.github.io/mc-mod-manager/`. It is read-only: there is no Manage page, and LocalStorage drafts are ignored.

1. Push this repository to GitHub as `mc-mod-manager`. If you use another name, change the `base` in `vite.config.ts` to match.
2. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main`, or run **Deploy to GitHub Pages** from the **Actions** tab.

The workflow (`.github/workflows/deploy.yml`) installs with `pnpm install --frozen-lockfile`, runs lint and typecheck, builds with `GITHUB_PAGES=true` so assets use the `/mc-mod-manager/` base path, and publishes `dist`. Navigation uses hash routes (`#/`, `#/manage`), so no rewrite rules or `404.html` are needed. The app needs no secrets.

To try the production paths locally:

```sh
GITHUB_PAGES=true pnpm build
pnpm preview
```

Then open `http://localhost:4173/mc-mod-manager/`.

## Known limitations

- Drafts are per browser. There is no sync, account, or multi-user editing, and only one modpack profile.
- Publishing is manual: export, replace files, commit.
- Compatibility needs Modrinth version metadata. Manual and unmatched entries are always Unknown.
- Loaders must match exactly, except Fabric mods on Quilt, which are a Warning. Forge-only versions on a NeoForge pack are reported as Incompatible, even though NeoForge 1.20.1 can load many Forge mods.
- Declared Minecraft version ranges in JAR metadata are shown but not evaluated.
- Modrinth does not expose its rate-limit headers to browsers, so a rate-limit message cannot say exactly how long to wait.
- Search shows up to 100 results per query.
- JAR import reads up to 500 files per batch. It does not support ZIP64 archives, cannot tell Forge from NeoForge 1.20.1 when `mods.toml` has no loader dependency, and does not use mod icons from inside the JAR.
- Folder selection is not available in Firefox or Safari; selecting multiple files works everywhere.
- Update and live compatibility results are not saved. They reset when the page reloads.
- CurseForge, automatic downloads, and dependency installation are not supported.

---

© _2026 Namchok Singhachai_. MC Mod Manager is released under the [MIT License](LICENSE).
