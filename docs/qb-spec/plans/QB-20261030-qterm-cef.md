---
schema: 1
id: QB-20261030-qterm-cef
type: design
tier: strict
status: active
created: 2026-10-30
updated: 2026-10-30
supersedes: []
---
# Implementation and verification

- TASK-001 [REQ-001, AC-001]: Pin the proven Tauri/CEF runtime and matching plugins/JS API; relocate reproducible patch tooling outside experiment; configure CEF entry point and cache root. Preserve ordinary app data and separate new CEF browser storage from legacy engines. Growth budget: new Rust modules below source-size limits; lib.rs composition changes only.
- TASK-002 [REQ-002, REQ-003, AC-003, AC-004]: Add production CEF browser adapter with serialized environment ownership, shared native identity/proxy binding, asynchronous browser-close barrier, cookie flush and pool eviction. Connection/session watchdog owns disconnect cleanup even with zero pages; local context follows final-page close.
- TASK-003 [REQ-001, REQ-004, REQ-005, AC-002, AC-005]: Wire existing WebHost API, navigation, bounds/overlays, snapshots, metrics and data clear. Keep trusted-ui guard and capability scope. Add compile-time integration harness that invokes production adapter without exposing test control to guest IPC.
- TASK-004 [AC-001, AC-002, AC-003, AC-004, AC-005]: Reuse OpenSSH fixture and browser checks, add retirement/reopen and unrelated-connection continuity; run frontend/Rust/build gates, record actual platform coverage and artifacts.

## Checks
- VER-001 [AC-001]: Root application CEF package build, launch real frontend, trusted IPC smoke, signature/layout verification.
- VER-002 [AC-002, AC-003]: Real independent sshd fixtures plus existing checks.js/storage.js/context_continuity.py adapted to production child views.
- VER-003 [AC-004]: Native context pool count and identity, closed-browser barrier, repeat connection retirement/reopen, cookie persistence and B traffic, no direct local fallback or residual test processes.
- VER-004 [AC-005]: pnpm check; cargo fmt/clippy/test appropriate to desktop target; guest IPC/internal navigation denial and native browser API checks.

Architecture: infrastructure owns CEF/SSH adapters; domain browser identity and IPC remain stable. No frontend CEF details, no app authority in guests. Existing browser environment identity groups identical profile+route; live sessions are explicitly tracked so closing one session does not retire an environment still used by another.
Recovery: previous dev branch and legacy browser stores remain available. No delete or migration of WebKit/WebView2 data. A failed/timeout native close keeps the environment quarantined and reports error rather than reopening an unsafe cache path.

- TASK-005 [AC-006, AC-007, AC-008]: Cover shared-owner retirement, fail-closed worker startup and authorized native popup behavior.
- VER-005 [AC-006, AC-007, AC-008]: Focused lifetime tests plus native OpenSSH and popup assertions.


## Execution results — 2026-10-30
- TASK-001 / VER-001: complete for macOS package composition; pinned runtime patch,
  app/DMG build, arm64 helpers, deep strict ad-hoc signature, DMG checksum and
  absence of test-only markers verified. No notarization or install.
- TASK-002 / VER-003: ownership, gateway shutdown, late-close barrier, quarantine,
  retry, zero-page owner retirement and native pool release implemented and tested.
- TASK-003 / VER-004: adapter wired; frontend 1486 tests and 40 Node checks pass;
  Rust 370 tests pass (6 environment cases ignored), fmt/clippy/source-size pass.
  Full site-storage clear and native interaction parity are explicitly incomplete.
- TASK-004 / VER-002: two complete native OpenSSH runs each pass 139 checks.
  Both external OpenSSH transport and production Qterm russh session path are
  exercised; exact fixture limitations are recorded.
- TASK-005 / VER-005: shared-owner and failure recovery pass; native Alloy popup
  close fixed and family ID retained across nested callbacks. Each native run
  includes 40 popup cycles and real main-window close with live sockets and nested
  windows, verifying zero native ownership, no listeners and no helper processes.
  Disk-restored SW autonomous startup timing remains a separate coverage gap.
- Additional requested measurement: five quiet memory samples per usage stage,
  including all-owner retirement; ordinary artifact sizes/hashes recorded.

Evidence: [2026-10-30 report](../../../scripts/cef/evidence/2026-10-30.md).
The latest user-requested verification and repackaging is complete; this larger
migration change is not archived while AC-005 / AC-007 retain explicit gaps.

## Popup tabs implementation
- TASK-006 [REQ-006, AC-009]: Runtime opt-in child-popup lifecycle; adapter pending
  requests and common guest-view operations; reuse existing WebTabs/IPC. New
  modules own popup notifications and view dispatch, with <700 Rust lines each.
- VER-006 [AC-009]: Real packaged CEF/OpenSSH tests for embedded POST/opener,
  native window identity, nested close, rejection/expiry, sibling HTTP/WS and
  cross-connection isolation; existing popup frontend tests and repository gates.

TASK-006 / VER-006: completed for macOS arm64, with 164/164 native checks and
repository gates. Native close, failed/expired requests, live source connection
teardown and actual frontend IPC are covered. Other-platform verification remains
outside this run. Evidence: `scripts/cef/evidence/popup-tabs-2026-10-30.md`.
