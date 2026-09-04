---
id: QB-20260905-macos-traffic-light-post-layout
type: bugfix
tier: standard
status: active
created: 2026-09-05
updated: 2026-09-05
supersedes:
  - QB-20260905-macos-traffic-light-alignment
---

# macOS traffic-light post-layout alignment plan

## Requirement

Implement REQ-001 through REQ-004 from the matching change spec while retaining the existing AppKit geometry and platform boundary.

## Affected Files

- `src-tauri/src/infrastructure/window_chrome.rs`
- `src-tauri/src/lib.rs`
- `scripts/tauri-dev-runner.mjs`
- `scripts/tauri.node-test.mjs`
- `docs/qb-spec/specs/QB-20260905-macos-traffic-light-post-layout.md`
- `docs/qb-spec/plans/QB-20260905-macos-traffic-light-post-layout.md`

## Design

The adapter installs an AppKit `NSWindowDidUpdateNotification` observer scoped to Qterm's main `NSWindow`. The callback performs an idempotent geometry reconciliation after native updates, which covers first presentation without guessing event-loop timing. The retained observer is removed when the window is destroyed. Existing coalesced Tauri event scheduling remains a fallback for explicit move, resize, focus, and scale changes; the composition root only installs the adapter and forwards lifecycle events.

## Implementation Tasks

- [x] Add bounded, coalesced post-layout scheduling to the macOS adapter.
- [x] Expand realignment triggers to startup, resize, move, focus restoration, and scale changes.
- [x] Add event-policy regression tests next to the adapter.
- [x] Make each macOS dev launch replace stale instances of its exact bundle path and cover process matching.
- [x] Install and clean up the native window-update observer.
- [x] Make native frame reconciliation idempotent and add adjacent regression coverage.
- [x] Re-run formatting, tests, lint/type/build checks, and the actual development launch path; retain the spec as active until pixel-level visual confirmation.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Adapter review plus focused Rust tests and strict Clippy. |
| AC-002 | Unit tests for resize, move, focused/unfocused, and unrelated events. |
| AC-003 | Rust all-target checks, `pnpm check`, and macOS app build. |
| AC-004 | `pnpm tauri dev` launch smoke test and visual confirmation where permitted. |
| AC-005 | Node runner tests for exact executable matching and exclusions. |

## Test / Verification

1. Run focused `window_chrome` Rust tests.
2. Run Rust formatting, strict all-target/all-feature Clippy, and all-target/all-feature tests.
3. Run `pnpm check` and the source-size ratchet.
4. Build and launch the development bundle using `pnpm tauri dev`.
5. Record any remaining pixel-level visual check as residual evidence rather than archiving prematurely.
