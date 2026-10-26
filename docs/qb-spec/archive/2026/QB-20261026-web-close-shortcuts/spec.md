---
schema: 1
id: QB-20261026-web-close-shortcuts
type: feature
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Separate webpage tab close from browser block close

Authorization: user requested Option+W for webpage tabs and a block-close warning; clarification explicitly confirmed Command+W remains block close and Command+C remains copy.

## Requirements and acceptance

- REQ-001: On macOS Option+W closes only the selected tab in the active visible Web block, including when native webpage content owns focus. Reuse the close-button fallback (the final tab becomes a fresh blank tab); leave other blocks and their tabs intact.
- REQ-002: Every explicit Web block close (shortcut or header) requires confirmation even for local/disconnected browsing. State that all tabs close and will not be retained/restored. Cancel preserves tabs and sessions; confirm reuses existing cleanup and removes tab recovery data.
- REQ-003: Keep Command+W/Ctrl+W block close and Command+C copying. Ignore repeat/extra modifiers, modal/locked/background state and stale native guest events; clean up listeners with their owners.
- AC-001 [REQ-001]: DOM/native tests close the selected tab, preserve sibling pages and other blocks, and leave a fresh blank tab after closing the last tab. Native macOS probe verifies Option+W routing to a distinct tab-close event.
- AC-002 [REQ-002]: Local and connected Web block tests both show the irreversible tab warning, cancel leaves state unchanged and confirm closes exactly the target block; tab persistence regression proves removal cannot be recreated by stale callbacks.
- AC-003 [REQ-003]: Shortcut guard, modifier/repeat, source identity and listener cleanup tests pass; existing block shortcut/copy behavior remains unchanged.

## Behavior Delta

### ADDED
- REQ-001: Option+W closes the current webpage tab instead of acting as an unhandled input combination in that browser block.

### MODIFIED
- REQ-002: Local/disconnected Web blocks previously closed immediately; every Web block now confirms that its tabs will not be retained.

## Implementation

WebTabs remains the sole tab state owner; a small adjacent hook owns keyboard/native subscription and delegates selected-tab close. Existing scoped native-close transport supports a distinct event, and the Swift guest keyboard adapter emits it without exposing IPC to pages. Shared close model marks Web requests as requiring confirmation; Shell keeps its existing confirmation executor. No schema or dependency changes. Budget: new hook <100 lines; native adapter <60; Shell stays within its current baseline.

- [x] Add Option+W hook and native guest event with adjacent regression tests.
- [x] Require all Web block closes to confirm, with accurate labels/warning and cancel/cleanup coverage.
- [x] Run frontend/Rust gates and native macOS probes; document results and owner mapping.

Embedded review: PASS. Approved scope and clarification are sufficient; reuse existing tab fallback and persistence cleanup, with no change to copy or other block shortcuts.

## Verification

- AC-001: WebTabs integration passed with the macOS composed Option+W key (`∑`, code KeyW): only the selected tab is removed, a sibling input draft survives, and closing the final tab creates a fresh blank page. Hook tests verify current callbacks, active/visible ownership and native source matching. Native Swift/WebKit probe passed a distinct `qterm-close-web-tab` event for Option+W while Ctrl+W continues to emit `qterm-close-block`.
- AC-002: Shell integration tests cover both DOM/native block close for local/disconnected and connected Web blocks. All display “关闭后标签不会保留”; cancel does not dispatch or clean up sessions; retry/confirm targets exactly one block. Local confirmation uses “确认关闭” and does not show a misleading zero-session disconnect callout. Existing persistence tests passed: explicit block removal deletes tab recovery records and stale callbacks cannot recreate them.
- AC-003: Hook tests passed extra modifiers, repeat/composition, modal/menu/lock, inactive/hidden browsers, stale/wrong source and disposal. Command+C and Command+W are ignored by the tab-close handler; existing app shortcut/clipboard regression suites passed. Both native close subscriptions passed asynchronous cleanup tests.
- `pnpm check` passed: 244 Vitest files / 1461 tests, 27 Node tests, ESLint, TypeScript, Vite and source-size gates. Two pre-existing tests remain skipped; canvas/chunk-size warnings remain nonfatal. Initial implementation failures (active prop/local-state naming collision and a duplicate confirmation button label) and a test-only unsupported query option were fixed before the final full check.
- Rust formatting, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` and `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` passed on macOS (374 tests, 6 existing environment-dependent tests ignored).
- `src-tauri/examples/macos_web_block_close.swift`, compiled against the production Swift sources and WebKitPolicy.m, passed native Option+W tab dispatch, unchanged Ctrl+W block dispatch, repeat/exact-modifier protections, hidden/blocked behavior and cleanup. Probe uses an ephemeral WKWebView and no user data; compile/run commands are retained in the preceding all-block-close change. Production native menu is unchanged, so its preceding Command+W validation remains applicable.
- Directory Map records the hook owner. No persistence, permissions, dependencies or packaging changes. Rebuild/restart the desktop app for native behavior; the installed application and its sessions were not replaced or closed.
