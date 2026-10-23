# AGENTS.md

Instructions for AI coding agents working in the MC Mod Manager repository. Applies to any agent/tool (Claude Code, Codex, Cursor, etc.). Claude Code also reads `CLAUDE.md`, which points back here.

## Project Summary

Static Minecraft modpack showcase and local editor (v1.0). Published data lives in `public/data/`; browser edits stay in a LocalStorage draft until the user saves them with **Save to local JSON** (dev server) or exports them, and then commits the files. Manage and drafts exist only in `pnpm dev` (`import.meta.env.DEV`, see `src/app/routes.ts`); production builds are Preview-only and must not import editor code outside DEV-guarded branches. Manage also searches Modrinth (with version filters), checks compatibility and updates, imports local `.jar` files, and paginates and bulk-deletes the mod list. The app has light (default) and dark themes.

## Tech Stack (quick reference)

React 19, Vite, strict TypeScript (`noUncheckedIndexedAccess` is on), Tailwind CSS 4 plus `src/styles.css`, shadcn-style components on Radix Dialog, Select, and Popover (plus cmdk), React Hook Form + Zod, Motion for React, Vitest, pnpm. GitHub Pages uses hash routing (`#/`, `#/manage`) and the Vite base `/mc-mod-manager/` when `GITHUB_PAGES=true`.

Layout: `src/app` (shell, routing, data provider, toasts, theme), `src/features` (`preview`, `manage`, `modrinth`, `import`), `src/components` (shared UI, including `ui/select.tsx` and `ui/combobox.tsx`), `src/lib` (non-UI logic and its tests), `vite-plugins` (dev-server Node code, typechecked through `tsconfig.node.json`).

## Commands

Use pnpm exclusively. `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm preview` are defined in `package.json`.

## Architecture Rules

- Keep data validation and draft persistence separate from presentation.
- Validate JSON before importing it; failed imports must leave the current data unchanged.
- The browser never writes files itself. The only file-writing path is the dev-only Vite plugin `vite-plugins/localJsonSave.ts` (`apply: "serve"`). It writes only `public/data/modpack.json`, `mods.json`, `batches.json`, and `mod-inbox.json`, after schema validation, from loopback same-origin requests, atomically, and with a conflict check. Never add another write path, accept file paths from clients, or let it reach production builds. Files must still be committed to publish them.
- Keep Preview and Manage on a single shared data state. Drafts sync across tabs through the `storage` event in `DataProvider`; do not write a draft that arrived from another tab back to storage.
- Modules shared with `vite-plugins` (`src/lib/schema.ts`, `json.ts`, `localSaveProtocol.ts`, `heroImage.ts`) must stay DOM-free.
- The build plan (`public/data/batches.json`, `src/lib/batches.ts`) references mods by ID only and never copies mod objects. It is part of `Collection`, so drafts, save status, local save, and import/export cover it. Checklist `done` never changes a mod's `status`.
- Dependency overview (`src/lib/dependencyOverview.ts`) reuses existing dependency data: `modrinth.dependencies`, then `file.dependencies`, then the manual `dependencies` list. It matches only by identifiers in the same namespace, never by name. Missing metadata is Unknown, not "no dependencies". It is read-only.
- The Mod Inbox (`public/data/mod-inbox.json`, `src/lib/inbox.ts`) is separate from the collection: Quick Add writes only there, and inbox entries are never counted as mods. Promotion reuses `quickAddMods` and removes entries only after the new mods validate.
- List selection is keyed by mod ID, never by index. Keep pagination and selection logic pure in `src/lib/pagination.ts`.
- New JSON fields must be optional so existing files and drafts keep loading. Schemas live in `src/lib/schema.ts`.
- Keep Modrinth code split: `src/lib/modrinth/api.ts` (requests and response validation), `mapping.ts` (pure mapping), `service.ts` (orchestration and caching). Compatibility (`src/lib/compatibility.ts`) and update status (`src/lib/updates.ts`) stay pure and read-only; they never modify mods.
- JAR files are parsed locally (`src/lib/jar/`): never execute or upload them. Only SHA-1 hashes may be sent to Modrinth, and only when the user asks.
- Never download or install mods, and never call a backend or use secrets.
- Style with theme tokens from `src/styles.css` (`:root` for light, `:root[data-theme="dark"]` for dark). Do not hardcode colors in components or rules. Add a token to both themes instead.
- Use the shared `Select` (`src/components/ui/select.tsx`) or, for long lists, `Combobox` (`combobox.tsx`) instead of native `<select>`. In React Hook Form, bind them with `Controller`.
- Typography: Inter (`--font-sans`, the default) for all UI text. the Minecraft font by Craftron Gaming (`public/assets/fonts/Minecraft.ttf`, one regular weight; `--font-display` / `font-display`) only for the brand, hero title, major section headings, stat numbers, and small decorative labels. Never use it for long or dense text.
- Respect `prefers-reduced-motion`; app-wide Motion settings use `MotionConfig reducedMotion="user"`.

## Working Conventions

- **Agent collaboration and approval:** Think independently to understand the task, identify risks, and prepare a recommendation, but present that recommendation and wait for explicit approval before making changes, executing a plan, or taking an external action. Do not decide and act beyond the user's explicit scope.
- **Planning:** For small or medium scoped changes, proceed after approved scope without creating a separate implementation plan. Create a plan only when the user requests one or the work spans multiple systems or has material implementation risk.
- **Lightweight work:** For a focused file edit, small change, or UI-only change, do not use the full planning, test-first, and independent code-review flow. Make the approved change directly and use only the verification required below.
- If work cannot be completed safely or clearly—because requirements, authority, access, consequences, or a technical constraint are unclear—ask first. Do not force a workaround that changes scope or assumptions.
- Ask for help, request clarification, or use available collaboration when it would improve confidence; do not carry uncertainty alone.
- State the relevant fact and ask the next useful question rather than repeatedly apologizing. Confirmation is more useful than an apology.
- Don't add features, refactors, or abstractions beyond what's asked. Keep implementations small and focused.
- **Default verification boundaries:**
  - Do not run `pnpm build`, start a dev server, or use browser automation unless the user explicitly requests it.
  - For small UI-only changes, do not run tests; run only Prettier and ESLint on touched files.
  - For important non-visual logic, run only the focused tests that cover the changed behavior. Do not run the full test suite unless explicitly requested.
- **Testing policy:** Do not create or update automated tests for UI-only work (visual styling, layout, presentation components, or page appearance); the user performs that verification manually. Add automated tests for domain, application, repository, persistence, security-rule, migration, and other non-visual logic. Only change a UI test when the user explicitly asks for it or a UI change also changes non-visual behavior.
- **UI-only changes — verification checklist:**
  1. Do not write or update tests.
  2. Do not run `pnpm test` (full or focused), `pnpm build`, or `tsc -b`.
  3. Do not start the dev server or drive a browser (Playwright, Chrome automation) unless the user asks.
  4. Run only Prettier and ESLint on the touched files, e.g. `pnpm exec prettier --write <files>` and `pnpm exec eslint <files>`.
  5. Hand off: tell the user what to check by eye (pages, widths such as 360px and 1280px, states), and name any existing test that may break because visible text or markup changed.
- For logic, persistence, or security changes, run the focused test command(s) that cover the changed behavior. Do not run the full `pnpm test` suite by default; remind the user to run `pnpm test` locally instead.
- **Build verification:** Do not run `pnpm build` by default for small, isolated work that touches only a few files, and never for UI-only changes. Run it only when the change's risk warrants it, the user requests it, or it materially validates the work; otherwise, tell the user that they can build locally.
- For a multi-step implementation plan, when a build is warranted, run `pnpm build` once during final verification—not after each step.
- Document setup and deployment changes in `README.md`.

## Change and Git Workflow

- Before making any change, present the proposed scope and wait for explicit user approval. This applies even to clear, small, low-risk, or cosmetic changes.
- Ask before proceeding whenever scope is ambiguous, an action is destructive or irreversible, adds dependencies, changes external services, affects data outside the workspace, or cannot be completed as requested.
- After completing code changes:
  - Summarize what changed.
  - List important files changed.
  - Mention any remaining concerns or follow-up work.
  - Suggest a concise Git commit message based on the actual changes.
  - Use Conventional Commits format when appropriate.
  - Never run `git commit` unless explicitly requested.
- Never add AI/agent attribution to commits, tags, pull requests, or release notes (for example `Co-Authored-By: Claude …` or "Generated with …"). GitHub counts co-author trailers as repository contributors, and a pushed trailer cannot be removed without rewriting history.
- Never run `git push` (branches, tags, or `--force`) or create a GitHub Release. Prepare the commit or tag locally, then hand the user the exact push/release command to run.

### Commit Message Guidance

When asked to generate a commit message:

1. Use only staged changes (`git diff --cached`) when they exist. Otherwise, use only unstaged changes (`git diff`). Never mix them.
2. Ignore whitespace-only or formatting-only changes.
3. Use Conventional Commits. Include a scope when one is identifiable, and include any Jira key found in the diff after the scope.
4. Keep the subject line under 100 characters and describe the user or business impact rather than implementation noise.
5. Use the format `<type>(<scope>): <short summary>`; omit `(<scope>)` when no meaningful scope applies.

Example: `feat(manage): add bulk deletion for selected mods`

codex resume 01a15dcb-9ae2-7400-8fa1-88a9fa023944
