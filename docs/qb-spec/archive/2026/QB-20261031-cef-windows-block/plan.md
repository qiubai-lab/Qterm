---
schema: 1
id: QB-20261031-cef-windows-block
type: feature
tier: strict
status: archived
created: 2026-10-31
updated: 2026-10-31
supersedes: []
---
# Windows Browser Block implementation

- [x] TASK-001 [REQ-001, REQ-002, AC-001, AC-002]: Add UI-thread-only Win32 HWND surface adapter and enable supported capabilities; preserve macOS behavior.
- [x] TASK-002 [REQ-003, AC-003]: Extend the tracked CEF popup patch to create hidden Alloy Windows child windows and verify native adoption/teardown.
- [x] TASK-003 [REQ-004, AC-004]: Add lifetime-bound native input/focus routing, sharing existing trusted main events.
- [x] TASK-004 [AC-001, AC-002, AC-003, AC-004]: Add and run native tests plus isolated CEF app smoke; update Directory Map/development evidence.

Architecture gate: Win32 stays in infrastructure, no new frontend state or guest command channel. Test gate: adjacent native behavior tests and actual CEF execution protect HWND ownership, clipping/input, popup context and teardown. Source-size baseline passed with zero ratchet reminders.

- VER-001 [AC-001]: Focused Rust context/domain tests and real main/guest CEF load/authorization checks.
- VER-002 [AC-002, AC-004]: Adjacent Windows surface/input tests; live native focus/occlusion checks.
- VER-003 [AC-003]: Real popup POST/opener/nested/close checks using the compile-time parent harness.
- VER-004 [AC-001, AC-002, AC-003, AC-004]: pnpm check, Rust checks, generated patch verification, source-size and final diff review. Record existing/platform limitations explicitly.

## Verification results

- VER-001: PASS. Real main capability IPC; guest application/plugin IPC and internal-origin navigation rejected; automatic popup denied. Existing web/gateway/domain Rust tests passed.
- VER-002: PASS. Three adjacent Win32 tests cover fractional DPI/occlusion union, parent isolation, overlay/hook lifetime and shortcut qualification/repeat. Real CEF bounds, clipping, disabled/hidden focus recovery and PNG checks passed. Native input via computer-use typed successfully, activated the correct Block, then emitted one Ctrl+W event and kept the main window alive.
- VER-003: PASS. Real React adoption and native POST/Cookie/opener/noopener/named target/nested/script close passed. All guest contexts returned to the main-window baseline. Found and fixed Windows default-runtime/Alloy mixing crash by explicitly making roots Alloy too.
- VER-004: scoped checks PASS, repository-wide exceptions documented. 25/25 CEF checks; frontend 1486 passed/2 skipped with two workers; Clippy all-targets/all-features with denied warnings, production frontend build, debug native test build, changed-file rustfmt, source-size and pinned runtime fingerprint passed. Full Rust: 365 passed, one unrelated ConPTY clear-sequence expectation failed, six ignored. Node: 37 passed, two macOS path/symlink fixture failures on Windows, one skipped. Whole-tree fmt fails on existing CRLF files. No unrelated test failures hidden or permissions changed.

Evidence: `scripts/cef/evidence/windows-block-2026-10-31.md` and `.json`. Windows release sandbox, installer, real Windows SSH service and cross-monitor DPI remain outside this change's verified claims; broader macOS migration remains active separately.
