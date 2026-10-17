# AGENTS.md

Instructions for AI coding agents working in the MC Mod Manager repository. Applies to any agent/tool (Claude Code, Codex, Cursor, etc.). Claude Code also reads `CLAUDE.md`, which points back here.

## Project Summary

Static Minecraft modpack showcase and local editor (v1.0). Published data lives in `public/data/`; browser edits stay in LocalStorage until the user exports JSON and commits it. Manage also searches Modrinth, checks compatibility and updates, and imports local `.jar` files. The app has light (default) and dark themes.

## Tech Stack (quick reference)

React 19, Vite, strict TypeScript (`noUncheckedIndexedAccess` is on), Tailwind CSS 4 plus `src/styles.css`, shadcn-style components on Radix Dialog, React Hook Form + Zod, Motion for React, Vitest, pnpm. GitHub Pages uses hash routing (`#/`, `#/manage`) and the Vite base `/mc-mod-manager/` when `GITHUB_PAGES=true`.

Layout: `src/app` (shell, data provider, toasts, theme), `src/features` (`preview`, `manage`, `modrinth`, `import`), `src/components` (shared UI), `src/lib` (non-UI logic and its tests).

## Commands

Use pnpm exclusively. `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm preview` are defined in `package.json`.

## Architecture Rules

- Keep data validation and draft persistence separate from presentation.
- Validate JSON before importing it; failed imports must leave the current data unchanged.
- Never attempt to write repository JSON files from the browser. Exported files must be committed to publish them.
- Keep Preview and Manage on a single shared data state.
- New JSON fields must be optional so existing files and drafts keep loading. Schemas live in `src/lib/schema.ts`.
- Keep Modrinth code split: `src/lib/modrinth/api.ts` (requests and response validation), `mapping.ts` (pure mapping), `service.ts` (orchestration and caching). Compatibility (`src/lib/compatibility.ts`) and update status (`src/lib/updates.ts`) stay pure and read-only; they never modify mods.
- JAR files are parsed locally (`src/lib/jar/`): never execute or upload them. Only SHA-1 hashes may be sent to Modrinth, and only when the user asks.
- Never download or install mods, and never call a backend or use secrets.
- Style with theme tokens from `src/styles.css` (`:root` for light, `:root[data-theme="dark"]` for dark). Do not hardcode colors in components or rules. Add a token to both themes instead.
- Respect `prefers-reduced-motion`; app-wide Motion settings use `MotionConfig reducedMotion="user"`.

## Working Conventions

- **Agent collaboration and approval:** Think independently to understand the task, identify risks, and prepare a recommendation, but present that recommendation and wait for explicit approval before making changes, executing a plan, or taking an external action. Do not decide and act beyond the user's explicit scope.
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

## Git Commit Message

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

```
You are a senior software engineer reviewing git changes.

Your task:
Generate a high-quality commit message based ONLY on the relevant git changes.

Rules:

1. If staged changes exist (git diff --cached), use ONLY staged changes.
2. If no staged changes exist, use the regular git diff.
3. Never mix staged and unstaged changes.
4. Use Conventional Commit format.
5. Include scope if identifiable (e.g., invoice, payment, stock, auth, api).
6. If Jira keys appear in the diff, include them after the scope.
7. Keep subject line concise (<= 100 chars).
8. Focus on business impact, not syntax noise.
9. Ignore whitespace-only or formatting-only changes.

Output format:<type></type>feat(feature_name<scope></scope>): <short summary></short>

Example:
fix(payments): store payment payload as payments array only and keep backward-compatible parsing
```
