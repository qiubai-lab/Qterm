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

# macOS traffic-light post-layout alignment

## Goal

Keep the native macOS traffic lights centered after AppKit completes its title-bar layout, including when Qterm is launched through the development app bundle on a Retina MacBook display.

## Observed Behavior

The geometry-based alignment from `QB-20260905-macos-traffic-light-alignment` is present in the exact `Qterm Dev.app` binary launched by `pnpm tauri dev`, but the traffic lights remain about 6pt above the 40pt application-chrome center.

## Root Cause

The adapter queues two Tauri main-thread tasks during `RunEvent::Ready`, but Tauri delivers those tasks as ordinary user events. Both can run before AppKit's first native update and title-bar layout, so the later AppKit pass restores the default button frames. Moving the already-visible window emits a later event, after the hierarchy is stable, and the same geometry then succeeds. The prior change therefore confused "runs on the main thread" with "runs after the first native window update." Display resolution and aspect ratio are not direct inputs to the calculation.

The macOS development runner also left earlier development app processes orphaned during rebuilds. Five development instances were present during verification, four with parent PID 1, so an old window could remain visible after a new binary launched and make a valid change appear ineffective.

## Scope

- Observe AppKit's native window-update notification and reassert alignment after the update that can reset title-bar frames.
- Make frame application idempotent so observing native updates cannot create a relayout loop.
- Retain and remove the native observer with the main window lifecycle.
- Request alignment at startup and after resize, move, focus, and scale-factor events.
- Keep AppKit timing policy inside the native infrastructure adapter.
- Ensure the macOS development runner replaces stale instances of the exact development bundle so an old window cannot mask a newly built fix.

## Non-Goals

- Changing the 40pt application chrome, 14pt leading inset, button geometry, or application layout.
- Replacing native traffic lights with HTML controls.
- Adding per-resolution or per-device offsets.
- Changing Windows or Linux window controls.

## Requirements

- REQ-001: Alignment must execute after AppKit completes a native window update that may reset the title-bar hierarchy, including the first update at startup.
- REQ-002: Native update handling must be idempotent and must not create a relayout or notification loop.
- REQ-003: Startup, resize, move, focus restoration, and scale-factor changes must request realignment for the main window.
- REQ-004: Existing semantic center geometry and cross-platform behavior must remain unchanged.
- REQ-005: Each macOS development launch must gracefully replace older processes from the same exact development bundle path without targeting production Qterm or unrelated processes.

## Behavior Delta

### MODIFIED

- REQ-001: Native alignment is now tied to AppKit's window-update lifecycle rather than inferred from Tauri task-queue order.
- REQ-002: Correct frames are left untouched; AppKit-reset frames are restored once per observed update.
- REQ-003: Move and focus restoration join resize and scale changes as native relayout recovery signals.
- REQ-005: The development runner now removes orphaned `Qterm Dev.app` instances before launching the newly signed binary.

## Acceptance

- AC-001 (REQ-001, REQ-002): The macOS adapter owns an `NSWindowDidUpdateNotification` observer and applies geometry only when measured frames differ from their targets.
- AC-002 (REQ-003): Adjacent regression tests cover the window events that request alignment and prove focus loss does not request it.
- AC-003 (REQ-004): Existing geometry tests, frontend checks, Rust checks, and the macOS dev-app build continue to pass.
- AC-004 (REQ-001, REQ-004): `pnpm tauri dev` launches the updated development bundle; visual inspection confirms the traffic-light center on the current MacBook when screen capture is available.
- AC-005 (REQ-005): Runner unit tests prove process matching accepts only the exact development executable path and excludes production/helper/unrelated processes.

## Assumptions And Residual Uncertainty

- AppKit posts `NSWindowDidUpdateNotification` for the initial visible update and subsequent native updates; existing Tauri window-event recovery remains available if a platform change alters notification timing.
- Pixel-level confirmation may still require the user's desktop session because the automation environment lacks Screen Recording/Accessibility access.

## Recommended Approach

Install and retain a native AppKit window-update observer inside the existing window-chrome adapter. Keep `lib.rs` as a thin composition root, make geometry writes idempotent, and preserve the semantic center algorithm already protected by unit tests.

## Quality Check

The reproduced launch path, embedded adapter symbols, current display metrics, repository history, and pinned Wry behavior distinguish a native layout-timing regression from a resolution-specific offset. Scope and acceptance are measurable with no blocking ambiguity.

## Verification Evidence

- AC-001/AC-002: Six adjacent Rust tests pass for semantic centering, initial-origin independence, relayout event policy, focus-loss exclusion, destruction cleanup policy, dirty-request coalescing, and idempotent geometry reconciliation. The adapter retains an AppKit window-update observer and removes it on main-window destruction.
- AC-003: Rust format and strict Clippy pass; all-target/all-feature Rust tests pass (300 passed, 4 environment-dependent tests ignored). `pnpm check` passes 125 frontend test files / 921 tests, 16 script checks, lint, typecheck, source-size, and production frontend build.
- AC-003: `pnpm tauri build --bundles app` successfully builds and signs `Qterm.app`.
- AC-004: `pnpm tauri dev` rebuilt, signed, and launched one development app instance containing the native observer. The process remained healthy at idle without an update loop. The shell's Node 20 cannot run pinned pnpm 11, so the equivalent command used the workspace Node 24 runtime. Pixel-level confirmation remains pending because Screen Recording and Accessibility access are unavailable to this process.
- AC-005: The runner regression test proves exact development executable matching while excluding production, helper, and unrelated processes.
