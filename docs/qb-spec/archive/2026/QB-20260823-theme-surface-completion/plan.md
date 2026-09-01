---
id: QB-20260823-theme-surface-completion
status: archived
archived: 2026-09-02
legacy: true
---
# Theme Surface Completion Plan

## Goal

Complete Light-theme support for the remaining dark feature surfaces shown in network setup, terminal locking, jump-host selection, and file preview, while leaving the current Dark preset visually unchanged.

## Scope

- Migrate network-mode cards, rule-flow previews, exposure notes, and their interaction states to semantic theme roles.
- Migrate terminal-lock choice cards and unlock identity surfaces to semantic theme roles.
- Migrate jump-host picker list, options, status copy, icons, and footer to semantic theme roles.
- Migrate file preview toolbar, preview actions, badges, and Markdown preview content to semantic theme roles.
- Audit adjacent feature surfaces that share the same hard-coded Dark styling and include safe, local fixes where they use the same interaction vocabulary.
- Add regression assertions so these surfaces cannot revert to fixed Dark colors.

## Design and architecture decisions

- Preset files continue to own concrete colors; feature styles consume semantic variables only.
- Choice cards remain feature-owned because network modes, terminal locking, and jump hosts have different content and selection behavior. They share theme roles, not a forced generic React component.
- Generic command actions continue to use the shared `Button` system; feature cards remain native semantic buttons with feature-specific layout.
- Light-only compatibility overrides are not the target architecture. Migrated selectors work in both presets and provide a base for future presets.

## Implementation steps

1. Add a focused theme contract for the five reported surfaces and Markdown preview readability.
2. Replace structural backgrounds, borders, text, icons, and state colors with semantic variables in the owning feature stylesheets.
3. Cover hover, focus, selected, disabled, warning, danger, and scrollbar states where those states are adjacent to the migrated surface.
4. Run the focused theme tests, then `pnpm check`.
5. Review remaining hard-coded dark structural surfaces and record any intentionally deferred work.

## Acceptance criteria

- The five reported screenshots no longer contain dark islands under the Light preset.
- Primary and secondary text remain readable in Light mode; muted content uses `--muted` or `--dim`, not fixed gray.
- Dark mode continues to derive the same visual family from the default semantic tokens.
- Focus, hover, selected, disabled, warning, and destructive states remain distinguishable.
- Theme regression tests and the full frontend quality gate pass.

## Verification

- `pnpm vitest run src/app/themeStyles.test.ts`
- `pnpm check`
