---
id: QB-20260823-light-workspace-selection-shadow-continuity
status: archived
archived: 2026-09-02
legacy: true
---
# Light Workspace Selection Shadow Continuity

## Goal

Remove the visible shadow seams between the selected workspace tab and active internal pane in the Light preset while preserving clear, restrained selection emphasis in both presets.

## Scope

- Make selected workspace-tab border, surface, and shadow theme-owned.
- Make active-pane surface and moving-indicator shadow recipes theme-owned.
- Keep the Dark preset's current shadow character.
- Use a compact, non-clipped Light shadow recipe and a small accent signal on the selected tab icon.
- Correct Light hover compatibility rules so the real `.selected` state does not receive a second opaque hover surface.

## Constraints

- Preserve the 40px chrome, 30px tab, 5px canvas padding, and `overflow:hidden` workbench boundary.
- Preserve selection movement and reduced-motion behavior.
- Do not solve the seam by allowing workbench content or animation to overflow into app chrome or the utility rail.
- Avoid simultaneous large outer glows from the pane element and moving indicator in Light.

## Non-Goals

- Redesigning tab dimensions, workspace switching, pane layout, or Dark-theme selection.
- Changing active header typography or terminal content colors.
- Adding a new animation or visual dependency.

## Acceptance

- Workspace-tab selection contains no fixed Dark-palette border, surface, or shadow in `shell.css`.
- Light selected-tab shadow fits inside the five-pixel lower clearance and does not create a hard cutoff at the chrome boundary.
- Light active panes use outline/ring/inset emphasis without a broad clipped glow.
- Dark active-pane and selected-tab recipes retain the existing visual values.
- Hovering the already selected Light workspace tab does not add another background above the moving selection indicator.
- Selected workspace tabs retain a visible accent cue without relying on shadow alone.

## Acceptance To Verification

- Theme token ownership and Light/Dark recipes: `src/app/themeStyles.test.ts`.
- Selector consumption, state layering, and motion preservation: `src/app/appStyles.test.ts`.
- Workspace tab behavior remains intact: `src/workspace/WorkspaceShell.test.tsx`.
- Frontend integrity: focused Vitest followed by lint, full tests, typecheck, and build.

## Open Questions

None.

## Recommended Approach

Use composite semantic shadow tokens for the workspace-tab indicator and active-pane layers. Keep Dark values equivalent to the current rules; give Light a bounded tab shadow and no broad pane glow. This is preferable to additional Light-only specificity patches or relaxing overflow clipping because it fixes ownership and remains extensible for future presets.

## Next Skills

- `qterm-interface-design`: preserve compact selection hierarchy and motion.
- `writing-qb-plans`: Standard plan because shared theme contracts and multiple consumers/tests change.
- `protecting-critical-behavior`: regression assertions for an observed visual defect.
- `verifying-before-completion`: focused and complete frontend checks.
- Project Context: not needed; this is a scoped theme correction.
- Directory Map: not needed; no structural moves.
