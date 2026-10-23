---
schema: 1
id: QB-20261023-remove-osc133
type: feature
tier: standard
status: archived
created: 2026-10-23
updated: 2026-10-23
supersedes: []
---

# Remove OSC 133

Authorization: user explicitly requested removal of OSC 133 after diagnosing local startup regression against v0.5.5.

## Requirements
- REQ-001: Remove OSC 133 installers, parser, command-region state, navigation/output-copy menu and setting from local/SSH normal and history-free sessions.
- REQ-002: Restore ordinary local default-shell startup without PTY command injection; retain native OSC 7, SSH directory tracking, title/progress and ordinary selection copy.
- REQ-003: Read supported old terminal settings without losing other preferences; save schema v5 without retired preference; reject corrupt/future data without overwriting.

## Behavior Delta
### REMOVED
- REQ-001: OSC 133 automatic installation, interpretation and command-boundary UI are no longer supported.
### MODIFIED
- REQ-002: Ordinary local shells start directly, replacing the premature handshake/input injection introduced after v0.5.5.
- REQ-003: Terminal preferences migrate from v1–v4 to v5 when saved; legacy commandMarkersEnabled is compatibility input only.

## Acceptance
- AC-001 [REQ-001]: No active installer/parser/menu/setting remains; unknown OSC 133 does not change activity state.
- AC-002 [REQ-002]: Local PTY starts without injected command text and executes the first user command; OSC 7 remains emitted on macOS. Title/progress tests still pass.
- AC-003 [REQ-003]: Legacy true/false marker settings load, unrelated flags survive save/reload, retired key disappears and invalid/future files remain untouched.

## Plan and boundaries
1. Remove capability at its existing owners: domain script/settings, infrastructure launch/persistence, IPC and terminal presentation. Preserve unrelated title/progress work from later commits.
2. Restore verified v0.5.5 local startup; retain SSH OSC 7 behavior. Net source reduction; existing baselined modules must not grow.
3. Add migration and real PTY startup regression protection; retain title/progress checks and check absence of UI/protocol handling.
4. Update current documentation/Directory Map; preserve archived historical specs. Run pnpm check, cargo fmt/clippy/test and targeted PTY verification.

Architecture/critical behavior gates: existing layer ownership retained, obsolete modules removed. Migration tests protect data and PTY test protects the reported regression. Embedded standard quality check passed; no unresolved scope choices.

## Verification
- AC-001: Retired protocol ignored by real xterm; context menu and settings absence tested. Source scan finds retired preference only in migration compatibility/tests; installer modules and scripts deleted.
- AC-002: Real macOS PTY regression passes: no injected source, first user command proves execution with a non-contiguous input token, native OSC 7 emitted. Existing title/progress tests pass.
- AC-003: v3/v4 marker true/false migration, v1/v2 compatibility, save/reload and corrupt/future preservation tests pass.
- `pnpm check`: passed (source-size: zero reminders; ESLint, Vitest, Node tooling tests, TypeScript and Vite build). Initial full run had a 5-second timeout in an unrelated workspace-context-menu test while Rust checks ran concurrently; focused rerun and subsequent complete check both passed without changing that test.
- `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo test --all-targets --all-features`: 335 passed, 6 pre-existing ignored tests; includes actual local PTY regression. Executed on macOS; other platforms were not run.
- Directory Map and current capability documentation updated; historical archive preserved. No desktop release bundle built; no native dependency/configuration changes.

