---
schema: 1
id: QB-20261025-web-chrome
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Web Block scrollbar and transient feedback

User authorization: implement both previously assessed changes, 2026-10-25.

## Requirements and acceptance

- REQ-001: Theme browser-native scrollbars with narrow rounded thumbs, transparent tracks, no arrows, and terminal normal/hover/active colors. Site-drawn controls are outside scope.
- AC-001 (REQ-001): Native scrollbar CSS is installed after navigation and reflects application theme changes without adding guest IPC privileges.
- REQ-002: Feedback overlays content without reserving height; successful loading feedback waits two seconds then slides down in 200ms. Loading and errors remain visible; block visibility/title updates do not restart success feedback.
- AC-002 (REQ-002): Timer tests cover loading, success, navigation interruption, error persistence, and unmount cleanup. Content surface owns the overlay with no footer layout slot.
- REQ-003: Native guest clipping follows the visible feedback rectangle, including exit; hidden feedback leaves no input-obstructing cutout. Reduced motion removes spatial animation.
- AC-003 (REQ-003): Geometry tests cover partial downward exit, full exit, neighboring guests and fractional scale; native checks retain focus and guest isolation.

## Behavior Delta

### MODIFIED
- REQ-001: System-default native scrollbars become terminal-themed.
- REQ-002: Permanent footer becomes transient, non-layout feedback.

### ADDED
- REQ-003: Feedback participates in existing native overlay geometry.

## Implementation and boundary checks

- Independent WebFeedback component owns timers/presentation; WebBrowserPane only composes it.
- Scrollbar palette sampling belongs to web frontend; numeric palette transport and fixed script injection belong to native web infrastructure. No arbitrary script IPC, persistence, proxy or authentication changes.
- Extend existing native overlay discovery for feedback; keep full WebView bounds stable during animation.
- Growth budget: new capability files below 200 lines each, existing entrypoints only narrow wiring. Preflight source-size check passed without ratchet reminders.
- Embedded quality/architecture check passed: scope authorized, requirements mapped, no foundation changes. Timer races and clipping require adjacent regression protection.

## Verification

- AC-001: palette and injection tests passed; real Windows WebView2 smoke confirms 3px computed width, hidden arrows and updated thumb color. Navigation/theme resynchronization hook test passed. Guest IPC remains denied.
- AC-002: fake-clock lifecycle tests cover 2s dwell, 200ms exit, rerender stability, interrupted navigation, persistent errors and timer cleanup; pane nesting test passed.
- AC-003: fractional-DPI partial/full exit and neighboring-guest clipping tests passed; existing native focus/clip/layer cleanup smoke passed. Reduced-motion CSS removes spatial movement. Desktop screenshot tooling failed to initialize (`failed to write kernel assets`, OS error 3), so manual visual inspection is not claimed.
- `pnpm check` ran: source-size and lint passed; full Vitest had 1229 passes, 2 skips and 2 unrelated timing failures in workspaceTabDeck/GitChangePreview. Both failures plus all web tests passed when retried with two workers (18 files, 79 tests). Node tooling tests: 21 passed. TypeScript/Vite build passed after matching existing Node test-import typing convention.
- Final source-size: zero ratchet reminders; git diff whitespace check passed. Rust fmt and Clippy all targets/features passed. Full Rust run: 344 passed, 7 ignored, 3 unrelated Git fixture failures; sequential retry of all 21 Git tests passed, including all three initially failing cases.
- No native dependency/configuration/packaging changes: release bundle build not required. Directory Map records the new presentation/palette owners; no long-lived context or preference files changed.
