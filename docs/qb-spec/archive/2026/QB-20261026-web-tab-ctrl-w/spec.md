---
schema: 1
id: QB-20261026-web-tab-ctrl-w
type: bugfix
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Browser Ctrl+W closes the current tab

Authorization: user requested moving webpage tab close to Ctrl+W on macOS and Windows and removing Option+W.

## Requirements and acceptance

- REQ-001: Ctrl+W in the active Web block closes only its selected tab on macOS and Windows, including native guest focus. Preserve blank-tab fallback and all other blocks/tabs.
- REQ-002: Remove Option+W tab-close behavior. Preserve macOS Command+W block close, its mandatory lost-tabs confirmation, Command+C copy and non-web Ctrl+W block close. Windows Web block remains closable through its header.
- REQ-003: Resolve the overlapping block/tab shortcut independently of listener registration order. Keep modal/lock/repeat/source/lifecycle guards.
- AC-001 [REQ-001]: DOM and native tab routing tests pass on both platform paths; native Mac probe emits only tab-close for Ctrl+W.
- AC-002 [REQ-002]: Option+W passes through with no tab/block close; macOS Command+W still requests block close and non-web Ctrl+W is unchanged. Existing Web confirmation/persistence tests pass.
- AC-003 [REQ-003]: Integration with real WebTabs and workspace shortcut listeners in both registration orders closes exactly one tab, never the block. Existing guard and lifecycle tests remain passing.

## Behavior Delta

### MODIFIED
- REQ-001: Browser Ctrl+W previously requested block close; it now requests current-tab close on macOS and Windows.

### REMOVED
- REQ-002: Option+W no longer closes a browser tab.

## Implementation

Reuse the WebTabs-owned hook and native guest adapters. Workspace shortcut routing reserves Ctrl+W for WebTabs when the active leaf is web, preventing block close without depending on listener order. No new state store, schema, dependency or permission. Existing modules stay below their budgets; Shell composition does not grow.

- [x] Update DOM/native mappings and block-route exclusion.
- [x] Update platform tests and add listener-order integration coverage.
- [x] Run frontend/Rust gates and native Mac probe; document Windows verification limits.

Embedded review: PASS; user scope is explicit and existing ownership/protection is preserved.

## Verification

- AC-001: Real WebTabs tests pass with MacIntel and Win32 navigator paths: Ctrl+W removes the selected tab, preserves sibling input state and creates a blank tab after the last close. Native source routing remains generation/visibility checked. Windows WebView2 now emits `qterm-close-web-tab`; the adapter's controller ownership and repeat filtering are unchanged.
- AC-002: DOM integration verifies Option+W is not cancelled and does not remove tabs or close blocks. Native Swift probe verifies the same pass-through and no block-close emission for Ctrl+W. macOS Command+W still requests a block close; the existing Shell confirmation and tab-recovery deletion suites pass. No Option+W runtime branch remains; historical specs and rejection tests retain the old name as evidence.
- AC-003: `browserCloseShortcut.test.tsx` mounts the real tab and workspace handlers in both orders for macOS and Windows. Each Ctrl+W removes only the selected tab, never invokes onCloseBlock, and preserves the sibling tab. Existing modal/lock/repeat/composition/source/lifecycle tests pass.
- `pnpm check` passed: 245 Vitest files / 1466 tests, 27 Node tests, ESLint, TypeScript, Vite and source-size gates. Existing 2 skipped tests and canvas/chunk-size warnings remain nonfatal. Final diff whitespace check passed.
- Native macOS probe compiled with production Swift/WebKitPolicy sources passed: Ctrl+W tab-only routing, Option+W pass-through, exact modifiers/repeats, blocked/hidden surface guards and disposal. The test fixture disables spelling/autocorrection so a passed-through Option+W does not open a platform correction panel; the initial probe stalled in that system panel and was stopped, with no production setting changes.
- Rust formatting and all-target/all-feature Clippy passed. Initial full Rust tests had 373 pass, 6 ignored and one existing SOCKS forwarding fixture failure (`AddrInUse` binding a local port). That exact test passed on focused rerun; the full all-target/all-feature suite then passed with 374 tests and 6 existing environment-dependent ignored tests. No SOCKS code was changed.
- Windows native physical-key verification is unavailable on this macOS host (only aarch64-apple-darwin target installed); OS-neutral frontend tests and the unchanged WebView2 API usage are the available evidence. Recheck on Windows by focusing a webpage and pressing Ctrl+W: one tab closes, the block/window remain; Option+W does not close tabs.
- Directory Map updated. No permissions, dependencies, schemas or packaging changed. Rebuild/restart the desktop app for native changes; the installed app and user sessions were not modified.
