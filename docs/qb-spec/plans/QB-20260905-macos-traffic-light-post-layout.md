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

Implement REQ-001 through REQ-008 from the matching change spec while retaining native controls and the macOS-only platform boundary.

## Affected Files

- `src-tauri/src/infrastructure/window_chrome.rs`
- `src-tauri/src/infrastructure/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.macos.conf.json`
- `src-tauri/Cargo.toml`
- `scripts/tauri-dev-runner.mjs`
- `scripts/tauri.node-test.mjs`
- `docs/qb-spec/specs/QB-20260905-macos-traffic-light-post-layout.md`
- `docs/qb-spec/plans/QB-20260905-macos-traffic-light-post-layout.md`

## Design

The macOS platform config provides the pinned runtime's calibrated `{x: 14, y: 18}` traffic-light inset to Tauri. Tao/Wry applies that position from the native view drawing lifecycle, including live resize, rather than Qterm reacting after AppKit events. Remove the duplicate infrastructure adapter and composition hooks so there is exactly one frame owner, and exclude post-construction title synchronization on macOS to avoid Tao 0.35.3's reset path. Retain `Overlay`, native decorations, the hidden static title, and non-macOS title synchronization.

## Implementation Tasks

- [x] Add bounded, coalesced post-layout scheduling to the macOS adapter.
- [x] Expand realignment triggers to startup, resize, move, focus restoration, and scale changes.
- [x] Add event-policy regression tests next to the adapter.
- [x] Make each macOS dev launch replace stale instances of its exact bundle path and cover process matching.
- [x] Install and clean up the native window-update observer.
- [x] Make native frame reconciliation idempotent and add adjacent regression coverage.
- [x] Re-run formatting, tests, lint/type/build checks, and the actual development launch path; retain the spec as active until pixel-level visual confirmation.
- [x] Gate geometry reconciliation on the native full-screen style mask and add regression coverage for the ownership policy.
- [x] Re-run native formatting, focused tests, strict Clippy, and the development launch smoke test.
- [x] Add a failing repository test for runtime-owned macOS traffic-light configuration and absence of custom lifecycle hooks.
- [x] Configure the initial 14pt leading / 13pt vertical value and remove the custom AppKit adapter and wiring.
- [x] Remove native crate features used only by the deleted adapter, then run config, Rust, source-size, repository, package-build, and development-launch checks.
- [x] Add failing regression expectations for the calibrated `y: 18` inset and macOS exclusion from post-construction title synchronization.
- [x] Replace the incorrect `y: 13` derivation with the observed `y: 18` calibration and conditionally retain title synchronization only outside macOS.
- [x] Re-run focused checks, repository gates, the macOS package build, and the exact development-bundle launch smoke test; refresh automated evidence.
- [ ] Confirm centered traffic lights, full-screen reveal/click behavior, and rapid live-resize stability in the user's visible desktop session; archive only after that visual acceptance passes.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | macOS config test, absence-of-hook repository test, and package build. |
| AC-002 | Source inspection proves no Qterm window-event repair scheduler remains. |
| AC-003 | Rust all-target checks, `pnpm check`, and macOS app build. |
| AC-004 | `pnpm tauri dev` launch smoke test and visual confirmation where permitted. |
| AC-005 | Node runner tests for exact executable matching and exclusions. |
| AC-006 | Absence-of-hook repository test plus native full-screen top-edge reveal inspection. |
| AC-007 | Node repository test, config parse/build, and rapid native live-resize inspection. |
| AC-008 | Node source regression plus the platform CI matrix for the conditional setup path. |

## Test / Verification

1. Run the focused macOS configuration and single-owner repository tests.
2. Run Rust formatting, strict all-target/all-feature Clippy, and all-target/all-feature tests.
3. Run `pnpm check` and the source-size ratchet.
4. Build the signed macOS app and confirm the development bundle hot-rebuilds to one live process.
5. Record rapid live-resize and full-screen interaction checks as residual evidence when desktop automation permissions are unavailable; do not archive prematurely.
