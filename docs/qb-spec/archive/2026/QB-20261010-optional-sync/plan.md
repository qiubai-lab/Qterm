---
schema: 1
id: QB-20261010-optional-sync
type: feature
tier: strict
status: archived
created: 2026-10-10
updated: 2026-10-10
supersedes: []
---

# Implementation plan
- TASK-001 (REQ-002, REQ-003): shared framework-free protocol, validation and three-way merge crate with adjacent tests.
- TASK-002 (REQ-004, REQ-005): independent Axum service, normalized SQLite transactions, authentication, Docker and GHCR workflow.
- TASK-003 (REQ-005, REQ-006): desktop ports/adapters, native token storage, bounded HTTP and recoverable baseline journal, atomic local catalog import.
- TASK-004 (REQ-001, REQ-003): background runtime and settings panel, status and guarded conflict resolution.
- TASK-005 (REQ-001, REQ-004): documentation and source map; execute verification.

Growth budget: new cohesive modules below repository limits; existing baselined JSON profile repository gets a child sync adapter and test extraction before growth. Stable profile IPC and JSON schema remain unchanged. No source-size ceilings raised.

## Verification mapping
- VER-001 (AC-002, AC-003): shared core tests for merge, deletion and validation.
- VER-002 (AC-004, AC-005): service database/API tests for auth, CAS, relational persistence and malformed input.
- VER-003 (AC-001, AC-002, AC-005, AC-006): desktop sync tests and Rust fmt/clippy/tests.
- VER-004 (AC-001, AC-003): frontend settings tests and pnpm check.
- VER-005 (AC-004): Docker availability/build check and workflow inspection; report environment limitations.

Rollback: disable sync to retain local catalog; restore pre-upgrade server backup if needed. Never downgrade a newer database schema in place. Pending journal remains durable until recovered.

## Verification evidence (2026-10-10)
- TASK-001 through TASK-005 implemented; Directory Map updated. Source-size check passes with reduced existing baselines and new Rust roots included.
- VER-001: shared core cargo tests (4 passed) and clippy passed; independent edits, deletions, edit/delete conflicts and explicit resolution covered.
- VER-002: service cargo tests (4 passed), clippy and fmt passed. Native HTTP smoke verified health, unauthorized rejection, catalog write/read, stale revision 409, normalized SQLite rows and identical state after restart. Protocol unknown fields are rejected; request/catalog bounds and redirect prohibition were also inspected in adapters.
- VER-003: desktop cargo fmt/check/clippy passed; full all-targets/all-features tests: 321 passed, 6 intentionally ignored. Latest focused sync regression: 11 passed. Native Windows release MSI and NSIS builds passed after final changes. Keyring integration compiled; interactive native credential-store round trips and macOS/Linux packages were not exercised here.
- VER-004: final pnpm check uses VITEST_MAX_WORKERS=2 to fit this development machine: Vitest 180 files passed, 1 skipped; 1109 tests passed, 2 skipped; 17 Node script tests passed. ESLint, TypeScript and production build are included. Initial unrestricted run experienced concurrent timeout failures and exposed a settings DTO issue, which was fixed; final limited-concurrency run is the authoritative result. Focused settings tests (17) and connection-manager tests (32) also passed after their last changes. Browser inspection at 589x858 confirmed navigation/form/footer layout; browser-only IPC unavailable state was shown, not a native end-to-end success.
- VER-005: workflow/Compose YAML parsed and publication guards inspected; only sync-v tag pushes publish. Docker is unavailable on this host, so Docker build/run remains unverified; native server smoke provides partial runtime evidence. Linux-only dependency metadata could not resolve offline because target crates were absent. CI or the deployment host must run `docker build -f services/qterm-sync/Dockerfile -t qterm-sync:local .` and a persistent-volume smoke test before rollout. No tag, image or deployment was published.
- Scope review: full catalog transport is bounded; SQLite stores normalized rows. Credential material stays local. No source-size limits were raised; source-module extraction retains existing tests. No new long-term style preferences were inferred.
