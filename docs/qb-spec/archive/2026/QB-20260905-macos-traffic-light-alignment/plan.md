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

# macOS traffic-light alignment plan

## Requirement

Implement REQ-001 through REQ-004 from the matching change spec without altering the established cross-platform title-bar contract.

## Scope

Add one macOS native window-chrome adapter, wire it at window setup and native relayout events, remove the machine-specific Tauri inset, update adjacent regression coverage, and record the new stable module owner.

## Affected Files

- `src-tauri/src/infrastructure/window_chrome.rs`
- `src-tauri/src/infrastructure/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml` and `Cargo.lock`
- `src-tauri/tauri.macos.conf.json`
- `src/app/appStyles.test.ts`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

The infrastructure adapter converts Qterm's semantic 40px title-bar center into AppKit frame origins using actual button heights. It preserves the system-derived horizontal interval and applies only the existing 14px leading inset. The Tauri composition root invokes this platform capability and does not contain AppKit details. Existing UI and engineering constraints remain authoritative: native macOS controls stay native, the fixed 40px chrome remains unchanged, and platform adapter types do not enter domain, persistence, Workspace, or frontend state.

## Implementation Tasks

- [x] Add pure vertical-center geometry with regression tests for differing AppKit defaults.
- [x] Implement the AppKit adapter and enable only the narrow Objective-C bindings it requires.
- [x] Wire startup and relayout invocation from the composition root.
- [x] Remove the static traffic-light position and update the existing configuration/style contract test.
- [x] Update the Directory Map for the new native adapter owner.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Focused Rust unit tests plus the frontend macOS config/style test. |
| AC-002 | `appStyles.test.ts` and the existing relevant frontend checks. |
| AC-003 | Rust format, Clippy, and all-target tests on macOS. |
| AC-004 | `pnpm tauri build --bundles app` and focused visual inspection if the desktop session is available. |

## Test / Verification

1. Run the new Rust unit tests and the focused frontend style test.
2. Run the source-size ratchet with the bundled Node 22 runtime.
3. Run `cargo fmt --check`, strict Clippy, and Rust all-target tests.
4. Run `pnpm check` and `pnpm tauri build --bundles app` because native dependencies/configuration changed.
5. Inspect the built macOS window when the active desktop session allows reliable capture.

## Documentation Updates

Update `DIRECTORY_MAP.md` because the AppKit window-chrome ownership boundary becomes a stable native entry point. This correction does not introduce a new long-lived visual preference.
