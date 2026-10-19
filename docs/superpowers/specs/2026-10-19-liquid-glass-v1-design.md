# Liquid Glass V1 Design

## Purpose

Create a reusable Liquid Glass foundation for BLOCK/LIST without redesigning existing Preview or Manage screens. The foundation must preserve the warm-white/soft-emerald identity in light mode and provide a restrained dark-emerald treatment in dark mode.

## Scope

V1 adds semantic CSS tokens and three typed React primitives. It does not change existing page markup, navigation, cards, dialogs, business logic, data, or JSON files. It does not add dependencies, routes, browser-only showcases, or automated tests.

## Theme tokens

`src/styles.css` will define these tokens in both `:root` and `:root[data-theme="dark"]`:

- `--glass-bg`
- `--glass-bg-strong`
- `--glass-border`
- `--glass-highlight`
- `--glass-shadow`
- `--glass-blur`
- `--glass-saturation`

Light mode uses readable, warm pearl surfaces with neutral borders and soft shadows. Dark mode uses deep translucent emerald surfaces with muted mint borders and highlights. Values are semantic; components must not introduce hardcoded colors.

## Surface behavior

A shared `glass-surface` CSS rule provides the five glass layers:

1. Readable translucent background.
2. Subtle border.
3. Conditional backdrop blur and saturation.
4. Static inset top highlight through a non-interactive pseudo-element.
5. Soft external shadow.

The base style remains readable without `backdrop-filter`. An `@supports` rule applies `backdrop-filter` and `-webkit-backdrop-filter` only in supporting browsers. Text itself is never blurred. The treatment has no continuous animation, so reduced-motion behavior requires no new override.

## React primitives

Add `src/components/ui/glass.tsx` using the existing `class-variance-authority` and `cn` conventions.

- `GlassCard` renders a semantic `section` by default.
- `GlassPanel` renders a `div` by default.
- `GlassPill` renders a `span` by default.

Each primitive forwards `children`, `className`, and native props. All expose one optional `intensity` prop:

- `subtle`: denser, less pronounced treatment.
- `default`: balanced treatment.
- `strong`: most pronounced, reserved for sparse featured content.

Intensity variants only adjust CSS modifier classes for opacity, blur, and shadow. They do not change semantics, add state, or animate.

## Performance and accessibility

No V1 primitive is integrated into a page. This prevents backdrop blur from being applied to the 300+ row Mod Collection or other dense content before a future phase chooses appropriate placements. Existing keyboard focus styles remain authoritative. Glass visuals are decorative only and never indicate status by transparency alone.

## Verification

Per the approved UI-only scope, run Prettier and ESLint only on touched implementation files. Do not add or run automated tests, start a browser, or run a production build.

## Future phases

V2 may opt Preview hero metadata, statistics, filters, and navigation accents into these primitives. V3 may apply them selectively to Manage and Dashboard surfaces. Each integration must make an independent readability and performance decision.
