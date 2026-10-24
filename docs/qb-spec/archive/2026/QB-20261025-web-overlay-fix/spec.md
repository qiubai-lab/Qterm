---
schema: 1
id: QB-20261025-web-overlay-fix
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Keep native webpages visible under address suggestions

Authorization: fix the black webpage when opening recent history and the black rectangle around toolbar tooltips.

- REQ-001: Address-history list semantics must never hide the entire native webpage. Actual modal dialogs, menus and lock states retain hiding behavior.
- REQ-002: Toolbar tooltips prefer space above the address bar, with viewport fallback. Local native occlusions use the exact overlay bounds rather than a padded rectangle exposing the dark host behind it.
- AC-001 [REQ-001]: Regression distinguishes listboxes from modal dialogs, preserves local history clipping and clears it on dismissal; verify the actual Windows desktop with an SSH-backed guest still painted around the expanded list.
- AC-002 [REQ-002]: Tooltip tests cover above placement and top-edge fallback; verify the actual native webpage and the tooltip without a surrounding black cutout.
- AC-003 [REQ-001, REQ-002]: Run adjacent tests, source-size/lint/typecheck/build and frontend regression gates.

## Behavior Delta

### MODIFIED
- REQ-001: Remove role=listbox from the whole-guest hiding policy. Existing blocking list pickers are enclosed by dialogs, while the address suggestion portal is a local overlay.
- REQ-002: Add an optional above placement to the shared tooltip primitive and opt browser address toolbar buttons into it; remove the two CSS pixel occlusion expansion.

## Tasks

- [x] Reproduce in the real Windows development app and implement bounded frontend fixes.
- [x] Complete regression checks and archive native visual evidence.

Ownership review: webModel owns whole-view visibility, webSurfaceOcclusion owns local cutout geometry, useThemedTooltip owns position, and WebAddressBar opts into above placement. No native IPC, backend schema or dependencies change; no source-size baseline grows.


## Evidence

- Reproduced both reports in the running Qterm Dev window with its real SSH-backed WebView2 guest. Opening address suggestions initially replaced the whole visible guest with the dark host background; the page returned on dismissal.
- AC-001: After loading the updated frontend (hard reload of the development interface, then reopening the same original URL), the actual history list renders over the page while the surrounding and lower webpage stay painted. No synthetic page or mock IPC is used for this visual check. Screenshot: `docs/qb-spec/evidence/QB-20261025-web-overlay-fix/history-native.png`.
- AC-002: The actual history toolbar tooltip appears above the address bar; the native webpage below remains continuous with no black rectangular cutout. Screenshot: `docs/qb-spec/evidence/QB-20261025-web-overlay-fix/tooltip-native.png`. Tooltip focus and pointer hover share the same positioner; keyboard focus exercised the native visual result, and mouse-enter tests cover the position calculation. The original page and connections were restored; no credentials or remote page forms were entered.
- Adjacent initial run `pnpm exec vitest run src/web src/components/ThemedTooltipButton.test.tsx --maxWorkers=2`: 14 files / 38 tests passed. Additional above-placement/top-edge regression cases are included in the full check below. Existing modal behavior remains protected; list semantics alone no longer hide the guest. Exact clipping tests explicitly reject the old two-pixel expansion.
- Temporary accessibility diagnostics were removed. Native backend, protocol, permissions and session ownership are unchanged. Existing design/module skills apply, and this local bug fix creates no new durable preference or ownership boundary requiring a Directory Map update.

- AC-003: `pnpm check` passed source-size (zero reminders) and ESLint. Full Vitest completed with 197 files / 1202 tests passed, 1 file / 2 tests skipped, and one unrelated existing `workspaceTabDeck` preview test exceeding its 5-second timeout. Scoped rerun `pnpm exec vitest run src/app/workspaceTabDeck.test.tsx src/components/ThemedTooltipButton.test.tsx --maxWorkers=2` passed both files / all 9 tests without changing test timeouts. The check command itself exited nonzero on that initial timeout; its remaining stages were run separately: all 21 Node script tests passed, and `pnpm build` passed TypeScript and the Vite production build (existing chunk-size advisory only).
- Final diff whitespace validation passed. No release installer or Rust rebuild is required for this frontend-only correction.
