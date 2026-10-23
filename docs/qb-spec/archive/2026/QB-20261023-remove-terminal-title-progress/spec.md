---
schema: 1
id: QB-20261023-remove-terminal-title-progress
type: feature
tier: standard
status: archived
created: 2026-10-23
updated: 2026-10-23
supersedes: []
---

# Remove terminal application title and task progress

Authorization: user explicitly requested implementation of the assessed scope, retaining OSC 9 text notifications.

## Requirements
- REQ-001: Remove Qterm application-title (OSC 0/2) and progress (OSC 9;4) UI, settings, parsing/subscriptions, runtime registry, animations and related feature modules in desktop and Demo.
- REQ-002: Preserve OSC 9 text notifications, BEL/OSC 777, directory tracking, links, clipboard and terminal I/O. Unsupported numeric OSC 9 controls must never become notifications.
- REQ-003: Read existing v1–v5 settings without rewriting; save v6 without applicationTitleEnabled or commandMarkersEnabled, preserving remaining preferences and refusing corrupt/future files.

## Behavior Delta
### REMOVED
- REQ-001: Application title switch/header display and task progress status/animation are removed; no application-level activity state remains.
### MODIFIED
- REQ-003: Terminal settings save v6, treating retired fields only as legacy input.

## Acceptance
- AC-001 [REQ-001]: No title/progress setting or protocol tooltip entry remains; no activity parser/provider/view lifecycle remains. Typecheck and UI tests pass for desktop and shared Demo code.
- AC-002 [REQ-002]: Notification tests cover interleaved retired controls and text notifications over split UTF-8, BEL/ST; terminal/OSC 7/52/8 tests continue passing.
- AC-003 [REQ-003]: Old true/false title values and absent fields load; saving drops retired keys and preserves directory/history/passive preferences; corrupt/future input is not overwritten.

## Plan and boundaries
1. Remove frontend feature owners and wire the existing protocol tag directly into layout; retain all non-activity view responsibilities and notification parser.
2. Remove title field from domain/IPC; retain typed compatibility only in persistence and migrate saved schema to v6.
3. Replace retired feature tests with absence/migration and retained-notification regression tests; update current documentation and Directory Map while preserving archive history.
4. Run focused checks, source-size ratchet, pnpm check and Rust fmt/clippy/tests. Net deletion; baselined entrypoints must shrink or stay fixed.

Architecture/critical behavior gates: existing presentation, domain, transport and persistence boundaries remain; no new abstraction. Regression protection targets notification routing and data preservation. Embedded standard check passed; scope fully authorized.

## Verification
- AC-001: Protocol tooltip absence regression failed before removal and passed afterward; settings absence, direct protocol-tag layout wiring, typecheck and source scan confirm no title/progress frontend state remains. Terminal lifecycle test addon count updated for the removed addon; all 38 panel tests pass.
- AC-002: 94 focused frontend tests passed, including notification parser byte splits, OSC 9 text delivery/unread after ignored title/progress, retained directory/link/clipboard and layout coverage. Full suite subsequently passed.
- AC-003: Rust compatibility tests cover v4/v5 true/false/absent title flags, v1–v3 legacy loading, v6 save/reload, remaining preferences and rejection of corrupt/future data; IPC rejects the retired title key.
- `pnpm check`: passed, 1159 frontend tests (2 pre-existing skipped), 17 Node tests, ESLint, TypeScript and Vite build; source-size gate has zero reminders.
- `pnpm build:site`: passed, including Demo/shared frontend compilation.
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings`: passed.
- `cargo test --all-targets --all-features`: 335 passed, 6 pre-existing ignored. Tests executed on macOS; Windows/Linux were not run.
- Directory Map and current protocol documentation updated; archived prior changes retained. No native dependency or packaging change; no desktop bundle built.

