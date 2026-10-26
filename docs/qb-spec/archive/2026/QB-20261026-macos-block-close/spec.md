---
schema: 1
id: QB-20261026-macos-block-close
type: bugfix
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# macOS Command+W closes the active terminal block

Authorization: user accepted the native-menu analysis and explicitly requested implementation.

## Scope and acceptance

- REQ-001: macOS Command+W and its native menu item request closing only the active terminal block, never the application window. Keep ordinary window close and Command+Q behavior.
- REQ-002: Reuse existing connected-session confirmation, cancellation, modal/lock/editable protection and last-terminal invariant. Keep Ctrl+W behavior on all platforms.
- REQ-003: Native and DOM delivery must not close twice. Native event subscriptions must use current workspace state and clean up even when registration completes after unmount.
- AC-001 [REQ-001]: Native menu has a custom Command+W action and no predefined window-close accelerator; triggering it leaves the window alive and delivers the block-close event to the main window.
- AC-002 [REQ-002]: Tests cover active-terminal selection, confirmation/cancel, modal/lock/input/nonterminal/last-terminal rejection and retained Ctrl+W routing.
- AC-003 [REQ-003]: Tests cover single delivery, updated callbacks, asynchronous subscription cleanup and native repeat suppression.

## Behavior Delta

### MODIFIED

- REQ-001: Command+W previously invoked AppKit performClose and destroyed the full window after persistence flush; it now routes to active terminal block close.

## Implementation

Owner: macOS menu adapter owns native menu/accelerator and emits a scoped command; `src/lib/tauri/blockClose.ts` owns transport/lifetime; `useWorkspaceShortcuts` owns guards and delegates to Shell's existing confirmation and session cleanup. No persistence/IPC command/schema/dependency changes. Budget: native menu <200 lines, transport <80, shortcut hook <120; existing baselined façades must not grow.

- [x] Build explicit macOS menu preserving standard application/edit/view/window operations, replacing predefined close entries with one block-close command.
- [x] Subscribe once to scoped native commands with current React callback and safe asynchronous teardown; route through shared close guards, with DOM fallback only outside native macOS.
- [x] Add regression tests, run frontend checks and Rust fmt/clippy/tests, exercise native menu on macOS, and update Directory Map.

Embedded review: PASS; local adapter/controller boundaries are established, regression gates cover close protection and lifecycle. No independent review required.

## Verification

- AC-001: `cargo run --manifest-path src-tauri/Cargo.toml --example macos_block_close` passed in an isolated native AppKit/Tauri window. It traversed the real menu, confirmed exactly one Command+W owner with a custom action (no performClose), retained Command+Q, posted NSEvents, observed targeted close events and verified that the window survived. Ordinary window.close still removed the window. The fixture uses about:blank and loads no user configuration or sessions.
- AC-002: Frontend shell integration tests cover both Ctrl+W and native menu events, with connected/disconnected terminals, confirmation, cancellation, single-session cleanup and no closeCurrentWindow call. Hook tests cover modal, DOM dialog/menu, lock, editable focus, other active blocks and last-terminal protection. Existing workspace, search and lock tests passed.
- AC-003: Hook tests prove native Command+W plus matching DOM delivery closes once and subscriptions use current state without resubscribing. Adapter tests cover normal cleanup and registration resolving after unmount. Native smoke passed repeat suppression and a subsequent fresh press after keyup; an initial probe omitted keyup and was corrected to represent a distinct physical press.
- `pnpm check` passed: 243 Vitest files, 1427 tests, 27 Node tests, ESLint, TypeScript, Vite and source-size check (zero ratchet reminders). Two existing Vitest tests remain skipped. Existing canvas/chunk-size warnings remain nonfatal.
- Rust formatting and `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passed. `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` passed: 374 tests, 6 existing environment-dependent tests ignored. Final diff whitespace check passed.
- Directory Map records the native menu/transport owner; no dependencies, permissions, persistence schema or packaging changes. Rebuild and restart the native app to load the menu; the installed application was not replaced or its sessions closed.
