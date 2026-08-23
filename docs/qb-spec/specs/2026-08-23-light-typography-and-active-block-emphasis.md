# Light Typography and Active Block Emphasis

## Goal

Give the Light preset a calmer, layered text hierarchy and make the selected internal workbench window immediately recognizable without adding decorative noise.

## Scope

- Soften Light preset primary, strong, muted, tertiary, disabled, terminal, and editor foreground roles away from near-black values.
- Preserve readable contrast for compact desktop typography.
- Make the internal-window selected outline, ring, glow, and active header fully theme-owned.
- Strengthen the Light preset's active border and header surface while preserving the Dark preset's current character.
- Add regression contracts for both minimum readability and excessive-contrast avoidance.

## Constraints

- Light text must continue meeting the existing 4.5:1 minimum contrast contract.
- Strong text remains darker than ordinary text; metadata remains visibly secondary.
- Terminal/editor ANSI palette semantics are not globally flattened.
- Selection uses outline, surface, and header emphasis rather than a large tinted content overlay.

## Non-Goals

- Replacing Qterm typography or changing font sizes.
- Redesigning pane layout, active-pane movement, or focus behavior.
- Changing Dark preset typography.

## Acceptance

- Ordinary Light UI text no longer approaches pure black and remains at least 4.5:1 against its base surface.
- Strong, ordinary, muted, and tertiary text keep a predictable descending hierarchy.
- Terminal and editor default foregrounds follow the softened Light primary text family.
- Active internal-window outline and shadow contain no fixed Dark-palette color.
- The Light active pane has a visibly stronger outline and header surface than its inactive neighbor.

## Acceptance To Verification

- Token hierarchy and contrast bounds: `src/app/themeStyles.test.ts`.
- Active pane theme ownership: `src/app/appStyles.test.ts` and theme style contract.
- Frontend integrity: focused Vitest followed by `pnpm check`.

## Open Questions

None.

## Recommended Approach

Tune the Light preset's semantic tokens and introduce theme-owned active-pane ring/shadow roles. This is preferable to opacity filters or Light-only component overrides because it preserves hierarchy and lets future presets independently control emphasis.

## Next Skills

- `apple-design`: guide restrained typography hierarchy and multi-channel selection feedback.
- `qterm-interface-design`: preserve dense workbench character and existing pane structure.
- `writing-qb-plans`: Standard plan because tokens and multiple consumers/tests are affected.
- `protecting-critical-behavior`: regression contracts for a repeated visual issue.
- `verifying-before-completion`: focused and full frontend checks.
- Directory Map: not needed; no module boundary changes.
