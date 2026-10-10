---
schema: 1
id: QB-20261011-auto-command-markers
type: feature
tier: standard
status: archived
created: 2026-10-11
updated: 2026-10-11
supersedes: []
---

# Automatic command markers

Authorization: user requests automatic OSC 133 installation on local and SSH connection, like OSC 7.

## Scope / Behavior Delta

- REQ-001: Existing shell-integration preference also installs OSC 133 for Bash 4.4+ and Zsh. No settings migration or profile writes; reconnect applies the preference.
- REQ-002: Ordinary SSH uses the existing probed-shell initialization path. Local Unix uses the platform-selected login shell, suppresses bootstrap echo before submitting input and preserves user startup files. Unsupported shells keep their existing behavior; Windows default cmd has no supported OSC 133 preexec integration.
- REQ-003: History-free Bash embeds the same installer after user rc and history policy, without submitting a command through stdin.
- REQ-004: Installers remain idempotent, preserve prompt hooks/exit status and never change ordinary session history policy. OSC 7 must not flatten Bash PROMPT_COMMAND arrays.

## Acceptance / Plan

- AC-001 [REQ-001]: Settings and usage explain automatic scope and reconnection; disabled startup has no OSC 133 injection.
- AC-002 [REQ-002]: Generated Bash/Zsh input is a bounded single line; shell/path arguments remain literal. Local readiness precedes writing input; unsupported shells fall back to default.
- AC-003 [REQ-003]: History-free enabled/disabled tests verify the same script is used without relaxing history suppression.
- AC-004 [REQ-004]: Real Bash executes generated initialization, preserves array/scalar hooks, produces A/B/C/D with failed-command exit status, and repeated loading does not duplicate markers.

Owner: domain command_markers owns shared fixed script encoding; existing remote shell integration owns initial directory composition; local infrastructure owns shell process/startup handshake. No new IPC, persistence or parser state. Existing source-size ratchets may only shrink.

## Verification

- AC-001: Existing settings accessible name preserved, help and confirmation describe automatic installation/reconnect and unsupported platforms. Existing frontend settings tests pass in the suite.
- AC-002: Domain installer tests assert bounded single-line encoding. Local startup tests assert literal shell/marker argv, login semantics, disabled/unsupported fallback. Startup uses existing bounded ShellStartup readiness parser before writing the bootstrap.
- AC-003: History-free domain tests assert installer presence only when enabled; full Rust suite retains history-free SSH failure/timeout and policy coverage.
- AC-004: Real Bash (QTERM_TEST_BASH=D:/SDK/Git/bin/bash.exe) runs the actual generated SSH initialization twice, preserving scalar hooks with trailing comments and array hooks, checking A/B/C/D and exit code 1 without duplicate markers.
- Rust: cargo test --all-targets --all-features passed (315 passed, 6 ignored). Final local launch helper tests passed separately (2 tests, including one added after the full run). cargo fmt --check and cargo clippy --all-targets --all-features -- -D warnings passed.
- Native Unix PTY/remote SSH/Zsh end-to-end verification unavailable on this Windows host; documented manual checks remain. No dependency, native configuration or package change, so no release build needed.
- Frontend final gate: `pnpm check` passed (source-size, ESLint, 1148 Vitest tests passed / 2 skipped, 19 Node tests passed, TypeScript and Vite build). `git diff --check` passed. An unrelated GitChangePreview language-parser wait timed out in the first parallel full run; all 10 tests passed in its focused rerun, with no source/test changes to that feature.
