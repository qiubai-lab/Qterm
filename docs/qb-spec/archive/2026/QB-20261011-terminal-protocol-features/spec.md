---
schema: 1
id: QB-20261011-terminal-protocol-features
type: feature
tier: standard
status: archived
created: 2026-10-11
updated: 2026-10-11
supersedes: []
---

# Terminal protocol features

Authorization: user explicitly requested OSC 52 explanation/compatibility, OSC 133
command navigation/output copying, OSC 9;4 progress and dynamic titles, in that order.

## Scope and ownership

Terminal protocol addons own transient terminal-derived state. Command markers
refer to the live normal buffer, never a persisted command/text history. React
consumes snapshots and invokes narrow actions. Existing Tauri text clipboard
service remains the transport. Extract xterm view lifetime from TerminalPanel
before adding new wiring; both baselined entrypoints must not grow.

Shell integration scripts can be sourced for the current Bash/Zsh session; no
user profile edits or command injection through frontend input. Applications or
existing shell integrations may emit OSC 133 directly. No OSC 633, rich notification,
image, arbitrary tmux DCS execution, or clipboard-read implementation in this change.

## Requirements

- REQ-001: Explain write-only OSC 52 in connected terminal UI independently of notification/OSC 7 preferences; verify framing, targets and wrapped input boundaries.
- REQ-002: Track bounded OSC 133 commands in the normal buffer; navigate previous/next and copy only completed output, excluding prompts and preserving wrapped text; disable unsafe/truncated/alternate-screen copies.
- REQ-003: Parse only OSC 9;4 progress states into terminal-header text/progress, including clearing, error and paused; retain existing notification handling.
- REQ-004: Display sanitized bounded OSC 0/2 application titles as secondary metadata without changing saved names or host identity.
- REQ-005: Reset protocol state on session reset and clear, remove on disposal, suppress disconnected metadata, and preserve it on view reparenting.
- REQ-006: Supply current-session Bash/Zsh hooks and practical direct/SSH/tmux verification instructions; preserve existing shell configuration.

## Behavior Delta

### ADDED
- REQ-001: Protocol tooltip now describes OSC 52 even when notifications/OSC 7 are off.
- REQ-002: Terminal menu exposes command navigation and completed-output copying.
- REQ-003: Terminal header reflects application-reported progress.
- REQ-004: Terminal header shows an application title separately from host identity.
- REQ-005: New transient metadata follows the xterm view/session lifecycle.
- REQ-006: Opt-in current-session shell scripts provide command boundary emission.

## Acceptance

- AC-001 [REQ-001]: Tooltip and real xterm OSC 52 tests cover both terminators, split UTF-8 payloads, read rejection and BEL-terminated OSC 52 in an escaped tmux envelope (without claiming arbitrary DCS passthrough).
- AC-002 [REQ-002]: Real xterm tests cover command ordering, no-output/failed commands, wrapping, partial lines, scrollback eviction, resize and alternate buffer behavior; menu tests cover disabled states and clipboard errors.
- AC-003 [REQ-003]: Invalid progress is ignored, state 0 clears, 1–4 render labelled states and bounded percentages without generating notification events.
- AC-004 [REQ-004]: OSC 0/2 titles update, clear and truncate; controls/bidi formatting never reach the title UI.
- AC-005 [REQ-005]: Reset/disposal clears metadata and markers; reparenting reuses runtime; late cleanup cannot unregister a replacement.
- AC-006 [REQ-006]: Shell scripts pass available interpreter checks and emit A/B/C/D with exit status; documentation distinguishes automated checks from native/SSH/tmux manual verification.

## Implementation plan

- [x] OSC 52 tooltip and compatibility checks.
- [x] Extract terminal view lifetime; implement bounded OSC 133 addon and command menu.
- [x] Add shell integration scripts and usage.
- [x] Add progress/title snapshot and header presentation.
- [x] Run focused tests, pnpm check, update Directory Map and archive evidence.

## Quality and architecture gates

Scope and AC links checked; no unresolved product decision. No persistence or IPC
schema change. Pure progress/title decoding, marker adapter, runtime registry and
presentation remain separate. Critical tests prioritize buffer lifecycle, output
boundaries, malformed/untrusted protocol inputs, clipboard failure and stale ownership.

## Verification

- AC-001: Real xterm OSC 52 framing/UTF-8/read-rejection/escaped BEL envelope tests and protocol tooltip coverage. Direct/SSH/tmux manual steps documented in `docs/terminal-command-integration.md`.
- AC-002: `terminalActivity.test.ts` covers wrapped and partial output, incomplete/empty/failed commands, Unicode, 1 Mi-character cap, 200-command bound, eviction, alternate buffer and resize; `TerminalActivityUI.test.tsx` covers navigation, clipboard failure and retry.
- AC-003/004: Real xterm progress/title protocol tests plus header rendering, sanitization, empty-title clearing and disconnected suppression tests.
- AC-005: RIS, explicit reset/disposal and stale-owner registry tests; existing TerminalPanel reparenting/lifecycle coverage retained after view extraction.
- AC-006: Real Bash interpreter tests pass with `QTERM_TEST_BASH=D:/SDK/Git/bin/bash.exe`, including preserved prompt hooks, exit code 1, idempotent loading and noninteractive no-op. Zsh interpreter unavailable; hook return semantics checked against official Zsh hook documentation, but no runtime verification claimed.
- Visual QA: Actual React components with synthetic OSC inputs in a browser fixture, widths 800/390, dark/light/cyberpunk themes. Screenshot: `C:/Users/Test/.codex/visualizations/2026/10/10/01a126c6-a007-7060-a490-6830eab3cc0b/qterm-terminal-protocols.png`. Temporary fixture removed.
- Native desktop clipboard, remote SSH/tmux and Zsh end-to-end verification remain manual checks; no native package build or Rust verification needed because native code/config/dependencies are unchanged.
- Final integration gate: `pnpm check` passed (source-size ratchet, ESLint, 183 Vitest files / 1148 tests passed, 1 file / 2 tests intentionally skipped, 19 Node tests passed, TypeScript and Vite production build). Existing canvas-stub notices and Vite chunk-size warning are non-failing. `git diff --check` passed. Earlier stale OSC visibility assertions exposed an obsolete OSC 7 accessible label; the label and assertions were corrected before the successful full run.
