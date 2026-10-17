# MC Mod Manager

A static Minecraft modpack showcase and local editor. Phase 1 uses example data; check each mod's upstream page for actual compatibility before installing.

## Development

Requires Node.js 24+ and pnpm 11.24.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the Vite URL for Preview, or use `#/manage` for the editor. To check the project:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

The app loads published data from `public/data/modpack.json` and `public/data/mods.json`. Editing creates a debounced draft in this browser's LocalStorage. Preview displays that same draft. To publish, export both JSON files from **Manage → Data & export**, replace the files in `public/data/`, and commit them to the repository. The browser never writes to repository files. Invalid imports leave the current collection unchanged.

## GitHub Pages

This repository's Vite base path is `/mc-mod-manager/` when `GITHUB_PAGES=true`. If the repository name changes, update `vite.config.ts`. Navigation uses hash routes (`#/` and `#/manage`), so GitHub Pages needs no rewrite rule.

In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Push to `main` or run the workflow manually. The workflow installs from `pnpm-lock.yaml`, checks lint and types, builds with the Pages base path, and deploys `dist`.

## Scope

Phase 1 includes a showcase, local mod and pack editing, filtering, details, JSON import/export, and static deployment. It has no account system, backend, external mod API, or automatic dependency resolution.
