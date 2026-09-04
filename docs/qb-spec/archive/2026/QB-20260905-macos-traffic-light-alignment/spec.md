---
id: QB-20260905-macos-traffic-light-alignment
type: bugfix
tier: standard
status: archived
created: 2026-09-05
updated: 2026-09-05
archived: 2026-09-05
supersedes: []
---

# macOS traffic-light alignment

## Goal

Keep the native macOS traffic lights vertically centered with Qterm's 40px application chrome across Macs and AppKit versions, without changing Windows or Linux window controls.

## Observed Behavior

The traffic lights are visibly below the center of the brand plaque on the current MacBook. Git history shows the configured `y` value alternating between 18 and 22 after visual checks on a MacBook and a macmini.

## Root Cause

The pinned Wry implementation treats `trafficLightPosition.y` as extra title-bar-container height and preserves AppKit's existing button Y origin. Because that origin is supplied by AppKit and differs between the tested environments, a static configuration value aligns one machine while offsetting the other. The existing test protects only the literal number, not the intended center alignment.

## Scope

- Move vertical traffic-light alignment from a static Tauri inset to a macOS native window-chrome adapter.
- Center each native button from its actual height inside the established 40px chrome and retain the existing 14px left inset/system spacing.
- Reapply the geometry after window size or scale-factor changes.
- Replace the magic-number assertion with semantic geometry regression coverage.
- Keep the existing native decorations, overlay title bar, brand safe area, Windows/Linux controls, and Workspace behavior unchanged.

## Non-Goals

- Replacing native macOS traffic lights with HTML controls.
- Redesigning the application chrome or brand plaque.
- Changing window persistence, Workspace state, or other platform behavior.

## Requirements

- REQ-001: On macOS, the centers of all available native traffic-light buttons must align with the center of the 40px application chrome using each button's actual AppKit dimensions.
- REQ-002: The alignment must not depend on AppKit's initial vertical button origin or a machine-specific static Y inset.
- REQ-003: Native decorations, overlay title-bar behavior, the 14px left inset, native inter-button spacing, and non-macOS window controls must remain unchanged.
- REQ-004: Alignment must be restored when resizing, fullscreen transitions, or display scale changes cause AppKit to relayout the title bar.

## Behavior Delta

### MODIFIED

- REQ-001: Traffic lights are now centered from runtime native geometry instead of using one fixed vertical inset.
- REQ-002: Mac-specific AppKit defaults no longer determine the visible vertical alignment.
- REQ-004: Runtime relayouts now reassert Qterm's alignment contract.

## Acceptance

- AC-001 (REQ-001, REQ-002): Pure geometry tests demonstrate the same 20px center for different native button heights and initial origins, and the macOS config no longer declares `trafficLightPosition`.
- AC-002 (REQ-003): Existing frontend style/config tests continue to prove native overlay decorations, the brand safe area, and non-macOS controls.
- AC-003 (REQ-004): The composition root invokes the adapter at setup and on resize/scale-factor events, and the Rust target builds and tests successfully.
- AC-004 (REQ-001, REQ-003): A macOS app bundle builds successfully; focused native visual inspection confirms alignment where the environment permits it.

## Assumptions And Residual Uncertainty

- AppKit continues to expose standard close and miniaturize buttons for a decorated overlay window; absence is treated as a no-op so transient native state does not abort startup.
- Automated geometry and native compilation protect the invariant, but final appearance still benefits from checking both previously conflicting machines.

## Recommended Approach

Use a narrow infrastructure adapter around AppKit's standard window buttons. It owns native frame measurement and placement; `lib.rs` remains the composition root, while React, Workspace state, persistence, and IPC remain unaffected.

## Quality Check

The goal, non-goals, requirements, behavior delta, and acceptance criteria are closed. Root-cause evidence comes from both repository history and the pinned Wry source; no blocking ambiguity remains.

## Verification Evidence

- AC-001: `cargo test window_chrome --all-targets --all-features` passed both geometry regression tests; `appStyles.test.ts` passed all 49 tests and proves the static `trafficLightPosition` is absent.
- AC-002: `pnpm check` passed 125 test files / 921 tests plus lint, typecheck, source-size, script tests, and the production frontend build.
- AC-003: `cargo fmt --all -- --check`, strict all-target/all-feature Clippy, and `cargo test --all-targets --all-features` passed (296 passed, 4 environment-dependent tests ignored).
- AC-004: `pnpm tauri build --bundles app` produced and signed the macOS app bundle, and the built executable remained running during a focused launch smoke test. Pixel-level capture was blocked by the host's Screen Recording/Accessibility permissions, so the two-machine visual comparison remains a residual manual check.
- `git diff --check` and the source-size ratchet passed with no reminders.
