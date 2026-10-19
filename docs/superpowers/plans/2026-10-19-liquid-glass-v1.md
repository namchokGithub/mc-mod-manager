# Liquid Glass V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, theme-aware Liquid Glass foundation without changing any existing BLOCK/LIST screen.

**Architecture:** Define semantic glass tokens and the shared visual treatment in the existing stylesheet, including a readable non-blur baseline and progressive backdrop-filter enhancement. Add three thin React wrappers that select the shared surface and intensity classes while forwarding native element props; do not integrate them into current pages.

**Tech Stack:** React 19, TypeScript, class-variance-authority, Tailwind CSS 4, existing `cn` utility, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-10-19-liquid-glass-v1-design.md`

## Global Constraints

- Use the existing `:root` and `:root[data-theme="dark"]` token architecture; do not introduce a competing theme system.
- Add no dependencies, routes, React state, background services, or data changes.
- Do not modify existing Preview, Manage, modal, navigation, card, or list markup in V1.
- Use semantic CSS variables for colors; preserve visible keyboard focus behavior and readable non-blur fallbacks.
- Never apply a glass primitive to dense mod-list rows or add continuous animation.
- Do not add or run automated tests, build, or browser-based UI tests.
- Use pnpm only; run Prettier and ESLint only on touched implementation files.
- Do not commit unless the user explicitly requests it.

## Review Focus

- Light mode fallback: without backdrop-filter, a `GlassCard` still has an opaque-enough warm surface and readable text.
- Dark mode fallback: a `GlassPanel` retains deep emerald contrast without a bright or neon glow.
- Native props: `id`, `aria-*`, event handlers, and caller `className` reach the underlying native element.
- Variant containment: `strong` changes only surface treatment, not semantics, layout, or page-level state.
- Performance containment: no existing Preview or Manage component imports a glass primitive in V1.

---

### Task 1: Define the CSS liquid-glass foundation

**Files:**
- Modify: `src/styles.css:34-151` — add semantic glass tokens to both themes.
- Modify: `src/styles.css` near the shared base rules — add the shared surface, intensity modifiers, highlight, and progressive enhancement rules.

**Interfaces:**
- Produces: CSS classes `glass-surface`, `glass-subtle`, `glass-default`, and `glass-strong`.
- Produces: theme tokens `--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-highlight`, `--glass-shadow`, `--glass-blur`, and `--glass-saturation`.
- Consumed by: `GlassCard`, `GlassPanel`, and `GlassPill` in Task 2.

- [ ] **Step 1: Add the seven glass tokens to both existing theme blocks**

Use warm pearl values in `:root` and restrained dark-emerald/mint values in `:root[data-theme="dark"]`. The values must keep a readable surface without blur and reuse no component-local color literals.

- [ ] **Step 2: Add the shared base and highlight rules**

Implement `.glass-surface` with semantic background, border, shadow, inherited border radius, and a static `::before` top highlight that has `pointer-events: none`. Add `.glass-subtle`, `.glass-default`, and `.glass-strong` modifiers that differ only in glass intensity.

- [ ] **Step 3: Add progressive blur enhancement**

Within an `@supports` condition for `backdrop-filter`, apply both standard and `-webkit-` backdrop filtering to `.glass-surface`; use the blur and saturation tokens. Keep the base surface fully usable when the condition does not match.

- [ ] **Step 4: Format and inspect the stylesheet**

Run: `pnpm exec prettier --write src/styles.css && pnpm exec eslint src/styles.css && git diff --check`

Expected: Prettier and `git diff --check` pass. ESLint may report the stylesheet as ignored because this repository has no CSS ESLint configuration; record that warning without treating it as a failure.

### Task 2: Add typed glass primitives

**Files:**
- Create: `src/components/ui/glass.tsx` — native-element wrappers and intensity typing.

**Interfaces:**
- Consumes: `glass-surface`, `glass-subtle`, `glass-default`, and `glass-strong` from Task 1.
- Consumes: `cn` from `src/lib/utils.ts` and `cva` from `class-variance-authority`.
- Produces: `GlassIntensity`, `GlassCard`, `GlassPanel`, and `GlassPill` exports.

- [ ] **Step 1: Define the shared intensity variant contract**

Export `type GlassIntensity = "subtle" | "default" | "strong"`. Create a `cva` variant helper whose base class is `glass-surface`, whose three values add the matching intensity modifier, and whose default is `default`.

- [ ] **Step 2: Implement `GlassCard`**

Create `GlassCard(props: ComponentPropsWithoutRef<"section"> & { intensity?: GlassIntensity })` that renders a native `section`, merges variant and caller classes with `cn`, and forwards remaining props and children.

- [ ] **Step 3: Implement `GlassPanel` and `GlassPill`**

Create `GlassPanel` with `ComponentPropsWithoutRef<"div">` and `GlassPill` with `ComponentPropsWithoutRef<"span">`. Both use the same intensity contract and forwarding behavior as `GlassCard`; do not add polymorphic `as` support or other abstraction.

- [ ] **Step 4: Format, lint, and inspect the implementation**

Run: `pnpm exec prettier --write src/components/ui/glass.tsx && pnpm exec eslint src/components/ui/glass.tsx && git diff --check`

Expected: all commands pass with no errors. Do not add or run tests, start a dev server, use browser automation, or run a build.

### Task 3: Verify V1 scope containment

**Files:**
- Inspect: `src/features/preview/Preview.tsx`, `src/features/manage/Manage.tsx`, `src/app/App.tsx`.

**Interfaces:**
- Consumes: exports and CSS classes from Tasks 1–2.
- Produces: evidence that V1 is foundation-only and does not alter existing screen markup.

- [ ] **Step 1: Confirm no current page imports a glass primitive**

Run: `rg -n "Glass(Card|Panel|Pill)" src/app src/features`

Expected: no matches. The only references are the new primitive definitions themselves when searching the full `src` tree.

- [ ] **Step 2: Review the final diff against the approved scope**

Run: `git diff --check && git diff -- src/styles.css src/components/ui/glass.tsx`

Expected: the diff contains only foundation tokens, surface CSS, and the new wrappers; no existing page integration, data, or behavior changes.

## Self-review

- **Spec coverage:** Task 1 covers light/dark semantic tokens, glass layers, fallback, blur, and performance-safe CSS. Task 2 covers all three reusable primitives and intensities. Task 3 enforces the V1 no-redesign integration boundary.
- **Step scan:** Every implementation step identifies one file area, exact class/export names, and the required behavior. Verification follows the user-approved no-test policy.
- **Type consistency:** Task 1 produces the four exact CSS classes consumed by Task 2. Task 2 exports the `GlassIntensity` union and three fixed native-element components.
- **Review focus:** The five likely failures are addressed by Task 1's fallback/theme rules, Task 2's forwarding contract, and Task 3's containment check; no automated tests are added at the user's direction.
- **Proportion:** The plan limits V1 to two implementation tasks plus a scope audit and deliberately defers all page integration to future phases.
