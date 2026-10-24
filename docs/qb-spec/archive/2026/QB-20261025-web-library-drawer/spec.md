---
schema: 1
id: QB-20261025-web-library-drawer
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Block-local browsing library drawer

User authorized fixed metric slots, then requested browser history as a drawer sliding from the browser block's right edge. Existing Qterm interface/module skills and known native WebView clipping boundaries apply.

## Behavior Delta

### MODIFIED
- REQ-001: History/bookmarks opens inside the owning browser content surface as a right drawer rather than a viewport modal; search, tabs, favorites, rename, retry and confirmed deletion remain available.
- REQ-002: Native pages remain visible while only the owning page is clipped under the visible drawer. Nested destructive confirmation remains modal.
- REQ-003: Support interruptible entry/exit, reduced motion, Escape, explicit close and appropriate focus return. Closing animation retains clipping until removal.
- REQ-004: Footer metric labels remain stationary with fixed resource/duration slots and dash placeholders across missing/loading/completed values.

## Acceptance and implementation

- AC-001 (REQ-001): Pane and library tests cover local placement and preserved actions; compact drawer CSS keeps list scrolling with fixed header/toolbar/footer.
- AC-002 (REQ-002): Native geometry tests cover partial right exit, full exit, neighboring blocks and nested modal visibility.
- AC-003 (REQ-003): Lifecycle/focus tests cover rapid reopen, timer disposal, Escape nesting and reduced motion.
- AC-004 (REQ-004): Metric slot identity and size contracts tested through count digit growth and loading transitions; focused tests/typecheck/lint already passed.

Ownership: dedicated drawer presence hook and frame; existing library owns data/actions; native panel geometry remains in webSurfacePanels/webSurfaceOcclusion. No persistence, IPC or Rust changes needed. New modules budget below 150 lines; existing façade only composes the drawer. No new library or context preference.

## Verification

- `pnpm check` passed: source-size ratchet, ESLint, complete frontend/script tests, TypeScript and Vite production build.
- AC-001–004 covered by adjacent pane, library, drawer lifecycle, native panel/visibility and metric slot tests.
- `git diff --check` passed. No backend changes; no desktop package build required.
- Native desktop visual inspection was not completed in this turn; geometry and interaction verification is automated.
