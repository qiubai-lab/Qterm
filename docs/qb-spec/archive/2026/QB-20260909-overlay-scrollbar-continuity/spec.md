---
id: QB-20260909-overlay-scrollbar-continuity
type: bugfix
tier: standard
status: archived
created: 2026-09-09
updated: 2026-09-09
supersedes: []
---

# Overlay scrollbar continuity

## Goal

Restore the original overlay scrollbar behavior across ordinary Qterm scroll surfaces so headers, card edges, and content backgrounds remain visually continuous to the right edge.

## Observed Behavior

Several file, Git, connection, credential, and target-picker scrollers reserve a narrow native scrollbar lane. Sticky headers and adjacent chrome stop before that lane, producing a visible blank seam. The issue is most obvious in the file browser between its column header and vertical scrollbar.

## Root Cause

Explicit `::-webkit-scrollbar` width and thumb styling switches the macOS WebView from its native overlay scrollbar presentation to a layout-consuming scrollbar. Several later styles also add `scrollbar-gutter: stable`, making the reservation unconditional. A live development-app experiment confirmed that removing the file browser's WebKit override preserves the themed thin scrollbar through standard `scrollbar-color` / `scrollbar-width` while eliminating the seam.

## Scope

- Ordinary file, Git, connection, credential, and terminal-target list scrollers that currently force WebKit scrollbar geometry.
- Removal of stable scrollbar gutters that reserve a permanent lane beside content.
- Regression coverage that keeps ordinary native scrollbars overlay-based.

## Non-Goals

- Changing scroll ownership, list sizing, column responsiveness, or keyboard behavior.
- Changing xterm's dedicated scrollbar integration, the Git diff overview scrollbar, or intentionally hidden tab/submenu scrollbars.
- Redesigning scrollbar colors or theme tokens.

## Requirements

- REQ-001: Ordinary scroll surfaces must not force layout-consuming WebKit scrollbar geometry or reserve a stable scrollbar gutter.
- REQ-002: Affected surfaces must retain thin, theme-colored scrollbars through standard CSS scrollbar properties.
- REQ-003: Specialized xterm, Git diff overview, and intentionally hidden scrollbar implementations must remain unchanged.

## Behavior Delta

### MODIFIED

- REQ-001: Ordinary scrollers use native overlay presentation instead of explicit WebKit scrollbar sizing and stable layout gutters.
- REQ-002: Scrollbar theming is retained through standards-based properties rather than vendor geometry overrides.

## Acceptance

- AC-001 (REQ-001): File and Git sticky headers/backgrounds visually continue beneath the overlay scrollbar without a blank right-side seam.
- AC-002 (REQ-001, REQ-002): File, Git, connection, credential, and terminal-target scrollers declare thin themed standard scrollbar properties and no forced WebKit width or stable gutter.
- AC-003 (REQ-003): Existing specialized hidden/custom scrollbar selectors remain present and their focused tests pass.
- AC-004 (REQ-001, REQ-002, REQ-003): Focused style tests and `pnpm check` pass.

## Implementation Steps

1. Remove vendor scrollbar geometry/painting rules from ordinary scroll surfaces and remove their stable gutters.
2. Preserve each surface's existing `scrollbar-color` and `scrollbar-width` contract.
3. Update existing style assertions and add a cross-surface regression test that distinguishes ordinary overlay scrollers from specialized scrollbar implementations.
4. Verify the live development app, focused tests, and the full frontend check.

## Acceptance To Verification

| Acceptance | Check |
| --- | --- |
| AC-001 | Capture the running development app after hot reload and inspect the file/Git header-to-edge continuity. |
| AC-002 | Cross-surface CSS regression test plus repository search for prohibited ordinary WebKit width/gutter rules. |
| AC-003 | Existing terminal target and Git comparison scrollbar tests. |
| AC-004 | Focused Vitest run and `pnpm check`. |

## Quality Check

The reported multi-window symptom, repository history, CSS inspection, and live A/B experiment identify one shared rendering cause. The scope preserves specialized scroll implementations and has direct automated and visual acceptance checks.

## Verification Evidence

- AC-001: A live `Qterm Dev.app` hot-reload A/B check showed the file header seam disappear when the explicit WebKit scrollbar geometry was removed; the final file and Git surfaces render their headers/backgrounds continuously beneath overlay thumbs.
- AC-002: The cross-surface regression test confirms ordinary file, Git, connection, credential, and terminal-target scrollers retain standard thin/theme-colored scrollbar declarations without WebKit geometry or stable gutters.
- AC-003: Only the intentionally hidden workspace-tab and terminal-submenu bars, the xterm-specific bar, and the Git diff overview implementation retain explicit WebKit selectors. Their focused tests pass.
- AC-004: Six focused test files pass 94 assertions. The full frontend run passes 149 test files / 1007 tests and 17 Node script checks. TypeScript, focused ESLint, production Vite build, diff whitespace, and the source-size check pass; the source-size command reports four non-failing opportunities to lower existing ratchet baselines after this deletion-only cleanup.
