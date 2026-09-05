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

Keep the native macOS traffic lights centered and visually stable through startup, live resize, and full-screen transitions, including when Qterm is launched through the development app bundle on a Retina MacBook display.

## Observed Behavior

The geometry-based alignment from `QB-20260905-macos-traffic-light-alignment` is present in the exact `Qterm Dev.app` binary launched by `pnpm tauri dev`, but the traffic lights remain about 6pt above the 40pt application-chrome center.

After the post-update observer was added, native full-screen mode exposed a second failure: moving the pointer to the top initially reveals the macOS menu bar and traffic lights, but the controls immediately retract before they can be used.

After ownership moved back to Tauri with `{x: 14, y: 13}`, the supplied 144-DPI Retina capture still places the traffic-light center about 5pt above the 40pt application-chrome center.

## Root Cause

The adapter queues two Tauri main-thread tasks during `RunEvent::Ready`, but Tauri delivers those tasks as ordinary user events. Both can run before AppKit's first native update and title-bar layout, so the later AppKit pass restores the default button frames. Moving the already-visible window emits a later event, after the hierarchy is stable, and the same geometry then succeeds. The prior change therefore confused "runs on the main thread" with "runs after the first native window update." Display resolution and aspect ratio are not direct inputs to the calculation.

The macOS development runner also left earlier development app processes orphaned during rebuilds. Five development instances were present during verification, four with parent PID 1, so an old window could remain visible after a new binary launched and make a valid change appear ineffective.

In native full-screen mode, AppKit temporarily moves and animates the title-bar hierarchy as the pointer reaches the screen edge. The unconditional window-update observer treated those legitimate transient frames as drift and immediately forced the container back to Qterm's 40pt in-window position. That write competed with AppKit's reveal animation and caused the system controls to retract. This is a lifecycle-ownership conflict, not a resolution or aspect-ratio calculation error.

Fast user resizing exposes the same ownership defect at a higher frequency. AppKit performs a live-resize sequence and repeatedly lays out its private title-bar hierarchy, while Qterm reacts to every Tauri resize event and every `NSWindowDidUpdateNotification` by scheduling or immediately applying competing frame writes. AppKit briefly restores its layout and Qterm then restores its own, producing the visible upper-left jump. Tauri 2.11 already provides `trafficLightPosition` and applies it from the Tao/Wry native view drawing lifecycle; the custom adapter duplicated that runtime capability at a less stable lifecycle boundary.

The pinned Wry 0.55.1 implementation does not use `trafficLightPosition.y` as the close button's literal top coordinate. It makes the native title-bar container `closeButtonHeight + y` high and retains AppKit's existing button Y origin. Calculating `13` as `(40 - 14) / 2` therefore applied the wrong semantic model. The measured 5pt visual error matches the difference between `13` and the previously validated MacBook calibration of `18`.

The composition root also calls `set_title` after window construction. Tao 0.35.3 can reset a configured traffic-light inset when the title changes until another redraw re-applies it, so the hidden macOS title should remain the static configuration value instead of being mutated during setup.

## Scope

- Ensure the macOS development runner replaces stale instances of the exact development bundle so an old window cannot mask a newly built fix.
- Replace the custom post-layout observer and scheduler with Tauri's platform `trafficLightPosition` configuration so one native runtime owns traffic-light placement during creation, drawing, resize, and full-screen transitions.
- Calibrate the pinned runtime to `{x: 14, y: 18}` for the established 40pt application chrome.
- Avoid changing the hidden macOS window title after construction while preserving title synchronization on Windows and Linux.
- Keep the macOS overlay title bar, native decorations, hidden title, 14pt leading inset, and 40pt application-chrome visual center.

## Non-Goals

- Changing the 40pt application chrome, 14pt leading inset, button geometry, or application layout.
- Replacing native traffic lights with HTML controls.
- Adding per-resolution or per-device offsets.
- Changing Windows or Linux window controls.

## Requirements

- REQ-001: The native runtime must receive the logical traffic-light position during window construction and preserve it from the first visible draw onward.
- REQ-002: Traffic-light placement must have one native owner and must not create a relayout or notification loop.
- REQ-003: Startup, live resize, move, focus restoration, scale-factor changes, and full-screen transitions must preserve the configured logical traffic-light position through the native runtime lifecycle.
- REQ-004: Existing semantic center geometry and cross-platform behavior must remain unchanged.
- REQ-005: Each macOS development launch must gracefully replace older processes from the same exact development bundle path without targeting production Qterm or unrelated processes.
- REQ-006: Qterm must not register a window-update hook that competes with AppKit's native full-screen title-bar reveal and hide lifecycle.
- REQ-007: Qterm must use Tauri's supported macOS `trafficLightPosition` configuration and must not maintain a second AppKit observer, event scheduler, or direct standard-button frame writer.
- REQ-008: The composition root must not trigger Tao's post-construction title-reset path on macOS; non-macOS product-name synchronization must remain unchanged.

## Behavior Delta

### MODIFIED

- REQ-003: Native runtime drawing now preserves the configured position continuously; Qterm no longer repairs visible drift after framework events.
- REQ-005: The development runner now removes orphaned `Qterm Dev.app` instances before launching the newly signed binary.
- REQ-001: Placement moves from post-update repair to window-construction configuration and runtime drawing.
- REQ-002: The duplicate observer/task queue is removed, leaving one native placement owner.
- REQ-006: Qterm no longer observes window updates or writes title-bar frames during native full-screen reveal/hide animation.
- REQ-007: The hand-written AppKit geometry adapter is removed in favor of the Tauri/Tao/Wry traffic-light lifecycle already present in the pinned runtime.
- REQ-001: The runtime-owned inset is calibrated from the observed native result (`y: 18`) rather than from the incorrect assumption that Wry treats `y` as the button's literal top coordinate (`y: 13`).
- REQ-008: macOS keeps its hidden static window title during setup; Windows and Linux continue synchronizing the title to the configured product name.

## Acceptance

- AC-001 (REQ-001, REQ-002): The macOS window config supplies one logical traffic-light position to the native runtime and Qterm registers no competing window-update observer.
- AC-002 (REQ-003): Repository tests protect runtime-owned placement; no Qterm resize/focus/move scheduler remains.
- AC-003 (REQ-004): Existing geometry tests, frontend checks, Rust checks, and the macOS dev-app build continue to pass.
- AC-004 (REQ-001, REQ-004): `pnpm tauri dev` launches the updated development bundle; visual inspection confirms the traffic-light center on the current MacBook when screen capture is available.
- AC-005 (REQ-005): Runner unit tests prove process matching accepts only the exact development executable path and excludes production/helper/unrelated processes.
- AC-006 (REQ-006): Repository inspection proves the custom AppKit observer and frame writer are absent; manual full-screen inspection confirms the top-edge controls remain expanded and clickable.
- AC-007 (REQ-001, REQ-003, REQ-007): Repository regression tests prove the macOS overlay window has the calibrated `{x: 14, y: 18}` runtime positioning and that application composition contains no custom window-chrome lifecycle hook; rapid live resize shows no upper-left correction flash.
- AC-008 (REQ-008): Repository inspection proves post-construction product-name synchronization is excluded on macOS and remains compiled for Windows and Linux.

## Assumptions And Residual Uncertainty

- The pinned Tauri 2.11 / Tao / Wry implementation continues to apply configured traffic-light placement from native view drawing; an upstream runtime behavior change would require retesting this contract.
- The accepted `y: 18` value is a pinned-runtime calibration for Qterm's 40pt chrome, not a claim that Wry exposes literal top-left semantics. Moving to a runtime with different inset behavior requires visual recalibration.
- Pixel-level confirmation may still require the user's desktop session because the automation environment lacks Screen Recording/Accessibility access.

## Recommended Approach

Declare the calibrated logical inset through Tauri's macOS window configuration, remove Qterm's duplicate native observer/scheduler, and do not mutate the hidden macOS title after construction. This keeps placement in the runtime's native view drawing lifecycle, keeps `lib.rs` as a thin composition root, and preserves native controls without an application-level relayout loop.

## Quality Check

The reproduced launch path, supplied Retina pixel geometry, AppKit live-resize lifecycle, repository history, and pinned Tauri/Wry source distinguish the remaining calibration error from CSS alignment or display scaling. Scope and acceptance are measurable with no blocking ambiguity.

## Verification Evidence

- AC-001/AC-002/AC-006/AC-007: The accepted calibration regression tests first failed against `{x: 14, y: 13}`, then passed after the runtime-owned inset moved to `{x: 14, y: 18}` and macOS post-construction title mutation was excluded. All 49 focused application-style assertions and all 11 focused Tauri wrapper assertions pass. Repository inspection finds no `window_chrome`, `NSWindowDidUpdateNotification`, `standardWindowButton`, or `setFrameOrigin` call in Qterm runtime source.
- AC-003: Rust format and strict Clippy pass; all-target/all-feature Rust tests pass (294 passed, 4 environment-dependent tests ignored). `pnpm check` passes 125 frontend test files / 921 tests, 17 script checks, lint, typecheck, the source-size ratchet with zero reminders, and the production frontend build.
- AC-003: `pnpm tauri build --bundles app` successfully parses the platform configuration, builds, and ad-hoc signs `Qterm.app`.
- AC-004: `pnpm tauri dev` rebuilt, signed, and launched exactly one current `target/tauri-dev/debug/Qterm Dev.app` process; the controlled smoke-test shutdown left no runner, Vite, or development-app process behind. Pixel-level confirmation remains pending because macOS denied this process Screen Recording and Accessibility access.
- AC-005: The runner regression test continues to prove exact development executable matching while excluding production, helper, and unrelated processes.
- AC-006/AC-007: Automated ownership checks pass; interactive full-screen reveal/click and rapid live-resize confirmation require the user's desktop session.
- AC-008: The source regression proves the product-name `set_title` call is guarded by `cfg(not(target_os = "macos"))`; the native macOS build passes, while Windows/Linux compilation remains covered by their platform CI jobs.
