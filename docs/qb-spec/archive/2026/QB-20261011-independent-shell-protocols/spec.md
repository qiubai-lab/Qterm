---
schema: 1
id: QB-20261011-independent-shell-protocols
type: feature
tier: standard
status: archived
created: 2026-10-11
updated: 2026-10-11
supersedes: []
---

# Independent shell protocol settings

Authorization: user asks to split OSC 7 and OSC 133 into independently configured, dynamically composed injection.

## Behavior Delta and acceptance

- REQ-001 / AC-001: Keep existing OSC 7 setting and add commandMarkersEnabled for OSC 133. Both have independent save/failure behavior. Existing v1/v2 settings inherit OSC 133 from the old combined preference without rewriting on load; save writes schema v3. New installs enable both. Corrupt/future documents are not overwritten.
- REQ-002 / AC-002: Compose all four protocol combinations. Ordinary local Unix and SSH, plus history-free Bash, use a typed feature snapshot. Disabling OSC 7 must not disable OSC 133; disabling OSC 133 must not remove directory reporting.
- REQ-003 / AC-003: Shell probing happens when either automatic feature is needed, only for terminal sessions. Unsupported OSC 133-only shells retain normal PTY echo and startup. Existing connections keep their installed hooks until reconnection; passive OSC 133 receive support remains enabled.
- REQ-004 / AC-004: Real Bash tests run actual generated input for all four combinations and scalar/array user hooks, verifying markers, idempotence and failed-command status. UI tests cover independent patches, persistence and save failures.

Owner: TerminalSettings and persistence own preferences/migration; ShellFeatures and existing domain composers own fixed script assembly; local/SSH adapters use the snapshot; SettingsDialog uses existing controls. No new script execution API or profile writes. Source-size baselines cannot grow; move the SSH connection-request test fixture into its own adjacent module.

## Verification

- AC-001: Persistence migration/round-trip tests cover v1/v2 load without rewrite, schema v3 save, all four flag combinations and preservation of corrupt/future documents. Settings UI tests verify independent patches, reload and save-error rollback.
- AC-002: Real Bash runs all four generated combinations with scalar (including trailing comments) and array prompt hooks; verifies OSC 7 / OSC 133 presence independently, failed-command status and idempotent installation. History-free composer tests cover all four combinations after history policy.
- AC-003: SSH connection-policy tests verify OSC 133-only probing and exclusion of auxiliary sessions. Unsupported OSC 133-only shell filtering preserves normal echo. Native Unix/Zsh/real remote SSH end-to-end checks remain unavailable on this Windows host.
- AC-004: Browser fixture uses the actual SettingsDialog and theme with mocked IPC; changing OSC 7 to off leaves OSC 133 on. Screenshot: `C:/Users/Test/.codex/visualizations/2026/10/10/01a126c6-a007-7060-a490-6830eab3cc0b/qterm-independent-osc-settings.png`. Temporary fixture/server/tab removed.
- `cargo test --all-targets --all-features`: 318 passed / 6 ignored; final `cargo clippy --all-targets --all-features -- -D warnings` and `cargo fmt --check` passed after test-only compatibility helpers were cfg-gated.
- `pnpm check`: source-size, lint, 1149 Vitest tests (2 skipped), 19 Node tests, TypeScript and production build passed. `git diff --check` passed. No native dependencies/config/package changes; no release package build required.
