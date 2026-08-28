---
id: QB-20260829-inherit-terminal-split-context
tier: strict
status: completed
created: 2026-08-29
updated: 2026-08-29
spec: ../specs/QB-20260829-inherit-terminal-split-context.md
---

# Plan: inherit terminal split connection and directory context

## Execution Tasks

- [x] TASK-001 [REQ-001, REQ-002, REQ-003, REQ-007, REQ-008]: Add failing frontend regression tests for deterministic context-aware splits, profile inheritance, one-time OSC 7 directory routing, all split entry points, independent runtimes, and absence from Workspace persistence.
- [x] TASK-002 [REQ-001, REQ-002, REQ-003, REQ-007, REQ-008]: Introduce a Workspace runtime split operation that snapshots the anchor context, creates deterministic layout IDs, and supplies an ephemeral launch directory to the intended new terminal without changing the Workspace schema.
- [x] TASK-003 [REQ-002, REQ-003, REQ-005, REQ-006]: Extend the frontend and Tauri session-start contracts with an optional initial directory and validate it into a bounded domain value before local or SSH infrastructure receives it.
- [x] TASK-004 [REQ-004, REQ-005]: Build Shell-specific Bash, Zsh, Fish, and PowerShell initialization payloads that quote the directory literally, change directory non-fatally, then install/report OSC 7 before interactive use; add injection-focused regression tests.
- [x] TASK-005 [REQ-005, REQ-006]: Resolve local initial directories through filesystem APIs, fall back to canonical home when invalid or unavailable, and report the actual selected working directory.
- [x] TASK-006 [REQ-001, REQ-003]: Update durable architecture documentation only where ownership or data-flow responsibilities changed; do not add a versioned Workspace field.
- [x] TASK-007 [REQ-001..REQ-008]: Run focused and repository-wide verification, record evidence, and archive the verified strict change when all required checks pass.

## Verification Plan

- VER-001 [AC-001, AC-002, AC-005, AC-006]: Run focused Vitest suites for the Workspace reducer/provider, LayoutView, WorkspaceShell, and Tauri frontend adapters. Evidence: assertions for profile inheritance, per-Block launch context, all entry points, local/remote IPC payloads, and independent runtime state.
- VER-002 [AC-003, AC-004, AC-005, AC-006]: Run focused Rust tests for initial-directory validation, Shell quoting/initialization ordering, session DTO conversion, SSH session startup, and local working-directory fallback.
- VER-003 [AC-001, AC-002, AC-006]: Run `pnpm check` to verify lint, frontend tests, type checking, and production build across the complete frontend.
- VER-004 [AC-003, AC-004, AC-005]: From `src-tauri`, run `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test --all-targets --all-features`.
- VER-005 [AC-002]: Inspect serialized Workspace fixtures and schema diffs to confirm the initial directory remains runtime-only and schema version 6 is unchanged.

## Ordering And Rollback

1. Protect behavior with frontend and domain-level regression tests before changing production paths.
2. Land the runtime split operation and narrow transport contract before wiring infrastructure behavior.
3. Implement remote quoting and local filesystem fallback independently so either side can be reverted without a persistence migration.
4. If verification exposes an unsupported Shell or platform edge, omit the initial directory and retain the existing normal connection path; no stored document migration or cleanup is required.

## Risks And Mitigations

- Terminal-provided OSC 7 paths are untrusted. Bounded domain validation and Shell-specific literal encoders are mandatory and covered by adversarial tests.
- Connection/authentication may require asynchronous retries. The per-Block launch snapshot remains ephemeral until that Block connects successfully and is cleared when the target changes or the Block closes.
- Local paths may disappear between split and spawn. The backend resolves the directory at spawn time and falls back to canonical home.
- The source may change directory after the split command. The operation deliberately uses a point-in-time snapshot so the new Block has deterministic launch behavior.
