---
schema: 1
id: QB-20261025-web-popup-tabs
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Native webpage requests into browser tabs

User approved the assessed native handoff design with “采纳，请你落地修复”. Existing local-browser work is present and must be preserved.

Root cause: windows.rs unconditionally denies new-window requests, while WebTabs has no native new-window input.

## Behavior Delta
### MODIFIED
- REQ-001: User-initiated target=_blank and window.open requests open a new tab in the source block while preserving the source page, network target and browser profile. Native handoff retains POST requests and opener semantics, including an initial blank window.
- REQ-002: Automatic popups, prohibited URLs and stale requests remain rejected with appropriate feedback. Guest IPC remains forbidden and remote failure never falls back to local.
### ADDED
- REQ-003: Pending native requests are bounded, single-use and expire; source navigation/closure, tab capacity, target switch and creation failure release deferrals and native resources. Script-requested popup closure closes the matching tab.

## Acceptance
- AC-001 [REQ-001]: Real WebView2 fixture covers target blank, clicked window.open, POST payload, blank-then-navigation, opener messaging, same-profile storage and preserved source. Local and remote proxy routes remain correct.
- AC-002 [REQ-002]: Policy and native tests cover automatic/prohibited requests, denied guest IPC and URL restrictions; frontend routes only matching live guest events.
- AC-003 [REQ-003]: Frontend regression tests cover tab capacity, duplicate events, cleanup, failure and native window close; native tests cover rejection, expiry/closed source and single-use handoff.

## Plan and ownership
- [x] Native popup policy, UI-thread deferral ownership, asynchronous child creation and WebHost lifecycle integration. AC-001/002/003.
- [x] Thin typed IPC and browser generation subscription; WebTabs owns new-tab allocation and capacity. AC-001/003.
- [x] Adjacent frontend/domain/native tests; full pnpm check, Rust fmt/clippy/tests, native smoke. AC-001/002/003. Repository-wide terminal-test exception recorded below.
- [x] Update Directory Map/browser documentation, record evidence and archive.

Embedded review: scoped additive behavior, no dependencies or persistence migration. Keep existing URL/IPC/proxy safeguards. Native objects remain on the UI thread; frontend receives opaque request IDs and never chooses the inherited network. New modules own request policy/lifetime and lifecycle adoption; baselined files do not grow. No global layout or new dialog design. Rollback restores popup blocking without altering stored browser data.

## Verification

AC-001/002/003 passed. [Evidence](../../../evidence/QB-20261025-web-popup-tabs/README.md) includes native captures of the real Baidu homepage and its news link child. The native smoke proved POST body preservation, opener/storage sharing, blank-then-navigation, source proxy routing, automatic popup blocking, guest IPC denial, and duplicate/rejected/navigated/closed/expired request cleanup. Frontend tests cover matching guest events through WebTabs to native adoption, capacity, same-batch closure, StrictMode, pending creation and subscription cleanup.

`pnpm check` passed (1335 tests passed, 2 skipped, plus script tests/lint/typecheck/build). Focused tests, lint and production build passed after the final blank-popup loading fix. Source-size check has zero ratchet reminders; `git diff --check`, Rust fmt and Clippy passed. Native smoke with `QTERM_WEB_LIVE_BAIDU=1` passed.

Repository-wide exception: Rust all-target/all-feature tests returned 360 passed, 1 failed and 7 ignored, both with two test threads and a serial retry. The only failure is the unchanged `infrastructure::local::pty::tests::default_shell_routes_terminal_io_and_can_be_closed` at `src-tauri/src/infrastructure/local/pty.rs:424`: Windows emitted `ESC[3J` and explicit cursor positions but not the exact `ESC[H` expected by the existing assertion. The terminal implementation/test directory has no diff. Popup acceptance has direct passing native/frontend/domain evidence, so this unrelated full-suite failure is retained as a documented verification limitation, without weakening or editing the terminal assertion.

Architecture review complete: bounded UI-thread request ownership, native environment inheritance, framework-only transport, frontend page ownership and stale-generation cleanup remain separate. No dependencies, stored data format, guest application authority or platform support changed. No release package needed.
