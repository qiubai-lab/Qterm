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

The adapter currently mutates AppKit frames synchronously during Tauri setup and resize/scale callbacks. AppKit can run a later native title-bar Auto Layout pass and overwrite those frames. The prior change removed Wry's continuously reapplied inset without replacing its late-layout timing behavior, so correct geometry is applied too early. Display resolution and aspect ratio are not direct inputs to the calculation; changing displays merely makes additional native relayouts more likely.

## Scope

- Schedule alignment on later main-thread event-loop turns rather than mutating frames synchronously.
- Coalesce repeated requests and replay alignment twice so one subsequent AppKit layout pass cannot erase it.
- Request alignment at startup and after resize, move, focus, and scale-factor events.
- Keep AppKit timing policy inside the native infrastructure adapter.
- Ensure the macOS development runner replaces stale instances of the exact development bundle so an old window cannot mask a newly built fix.

## Non-Goals

- Changing the 40pt application chrome, 14pt leading inset, button geometry, or application layout.
- Replacing native traffic lights with HTML controls.
- Adding per-resolution or per-device offsets.
- Changing Windows or Linux window controls.

## Requirements

- REQ-001: Alignment must execute after AppKit's synchronous title-bar layout opportunity rather than only inside the triggering callback.
- REQ-002: A queued request must survive one subsequent native relayout without creating an unbounded queue during resize.
- REQ-003: Startup, resize, move, focus restoration, and scale-factor changes must request realignment for the main window.
- REQ-004: Existing semantic center geometry and cross-platform behavior must remain unchanged.
- REQ-005: Each macOS development launch must gracefully replace older processes from the same exact development bundle path without targeting production Qterm or unrelated processes.

## Behavior Delta

### MODIFIED

- REQ-001: Native alignment is deferred to the main event loop instead of being applied synchronously.
- REQ-002: Each coalesced request now gets two bounded post-layout passes.
- REQ-003: Move and focus restoration join resize and scale changes as native relayout recovery signals.
- REQ-005: The development runner now removes orphaned `Qterm Dev.app` instances before launching the newly signed binary.

## Acceptance

- AC-001 (REQ-001, REQ-002): The macOS adapter owns deferred, coalesced, two-pass scheduling through Tauri's main-thread queue.
- AC-002 (REQ-003): Adjacent regression tests cover the window events that request alignment and prove focus loss does not request it.
- AC-003 (REQ-004): Existing geometry tests, frontend checks, Rust checks, and the macOS dev-app build continue to pass.
- AC-004 (REQ-001, REQ-004): `pnpm tauri dev` launches the updated development bundle; visual inspection confirms the traffic-light center on the current MacBook when screen capture is available.
- AC-005 (REQ-005): Runner unit tests prove process matching accepts only the exact development executable path and excludes production/helper/unrelated processes.

## Assumptions And Residual Uncertainty

- Two consecutive event-loop passes are sufficient for the native title-bar hierarchy used by pinned Tauri/Wry; further window events provide bounded recovery if AppKit relayouts later.
- Pixel-level confirmation may still require the user's desktop session because the automation environment lacks Screen Recording/Accessibility access.

## Recommended Approach

Expose scheduling and event-forwarding functions from the existing macOS window-chrome adapter. Keep `lib.rs` as a thin composition root and preserve the native geometry algorithm already protected by unit tests.

## Quality Check

The reproduced launch path, embedded adapter symbols, current display metrics, repository history, and pinned Wry behavior distinguish a native layout-timing regression from a resolution-specific offset. Scope and acceptance are measurable with no blocking ambiguity.
