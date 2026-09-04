---
id: QB-20260904-conpty-resize
type: bugfix
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---

# Windows local terminal resize

User authorization: test and fix the resize scrollback duplication reported in this task.

## Requirements
- REQ-001: Repeated Windows local terminal resizing must not duplicate existing output or clear legitimate scrollback.
- REQ-002: Keep Unix/SSH sizing behavior, local startup dimensions, forced reconnect synchronization, and disposal behavior intact.
- REQ-003: Keep resize orchestration in a terminal capability module; do not grow the baselined TerminalPanel or change IPC/persistence contracts.

## Evidence and scope
Real portable-pty 0.9.0 / Windows 26100.9168 / xterm 6.0.0 reproduces repeated cmd welcome text with 60ms output delivery delay and alternating 6–24 rows. Immediate xterm fit plus 50ms backend throttling produced 14 banners; pairing the two alone still produced 4. Exact counts vary with scheduling.
Fix Windows resize scheduling and protect it with real xterm/ConPTY and deterministic regression checks. No history clearing, text deduplication, shell replacement, native dependency upgrade, or unrelated UI changes.

## Acceptance
- AC-001 (REQ-001): Real ConPTY repeated resize probe with delayed output retains one welcome banner and usable prompt; existing output is preserved.
- AC-002 (REQ-001, REQ-002): Deterministic tests cover trailing resize coalescing, queued output drain, no duplicate application, force, and disposal. Non-Windows fit remains immediate.
- AC-003 (REQ-002, REQ-003): Terminal integration tests and pnpm check pass; size ratchet is respected; native probe builds and exits without leaving a shell.

## Behavior Delta
### MODIFIED
- REQ-001: Windows local grid resizing settles briefly before xterm and PTY dimensions are updated together, replacing immediate frontend fit with independently throttled backend updates.

## Quality
Standard embedded check passed: requirements and acceptance are linked, scope bounded, no approval or product ambiguity remains. Native graphical dragging and macOS/Linux execution are distinct from the automated local probe.

## Verification
- AC-001: real Windows 26100.9168 / portable-pty 0.9.0 / xterm 6.0.0 probe: original scheduling produced 14 welcome banners and 204 buffer rows; fixed scheduling retained 1 banner and 24 rows. Fixed probe also passed three settled width/height updates and executed QTERM_RESIZE_OK successfully. Simulated output delivery latency: 60ms.
- AC-002: 50 focused tests passed across terminalLayout, real-xterm ConPTY repaint regression, resizeScheduler and TerminalPanel, including local/SSH connection-time force sync. Native reproduction was established before implementation; the new unit suite was introduced before its implementation module.
- AC-003: pnpm check passed (123 files / 914 Vitest cases at that checkpoint, 13 tooling cases, lint, TypeScript and production build). Subsequent test-only additions passed the 50-case focused run and focused ESLint. Source-size check passed with zero reminders; TerminalPanel reduced from 776 to 764 lines. Native probe built and its rustfmt check passed. git diff --check passed.
- Existing non-blocking diagnostics: unused native notification variants during Rust build, a jsdom canvas warning in the full suite, and Vite's large-chunk warning. The new real-xterm regression uses the Node environment to avoid relying on jsdom rendering.
- Documentation: docs/conpty-resize-testing.md and Directory Map updated. No durable product/style context changes required.

## Residual coverage
Final follow-up: TypeScript check passed after the test additions; the fixed native probe also passed with 150ms simulated output latency, retaining one banner and a working prompt.

This verifies native PTY bytes and the actual xterm buffer, not a graphical Tauri window drag. macOS/Linux runtimes were not available for manual execution; their immediate-fit path and integration behavior are covered automatically. The 120ms settle policy is not a protocol acknowledgment and cannot guarantee synchronization for arbitrarily delayed output; no output clearing or deduplication is used.
