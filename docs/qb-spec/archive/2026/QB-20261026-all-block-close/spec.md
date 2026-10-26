---
schema: 1
id: QB-20261026-all-block-close
type: bugfix
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Close shortcuts for every workspace block

Authorization: user requested extending the existing close shortcuts to other block types.

## Requirements and acceptance

- REQ-001: Ctrl+W and macOS Command+W close the current Terminal, Files, Network, Git or Web block using existing close/confirmation/cleanup. Web close removes the entire block, not one tab. Keep last-terminal, modal, lock, editable input and repeat protections.
- REQ-002: Use block-specific confirmation text and generic native menu labels. A missing/protected block must not disconnect sessions before the reducer rejects its removal.
- REQ-003: Focused native web content routes Ctrl+W through a trusted native event with guest identity; accept only the current visible surface. Command+W keeps one macOS menu owner. No guest IPC permission or injected page handlers.
- AC-001 [REQ-001, REQ-002]: Tests cover all five block types, both shortcut paths, connected confirmation/cancel, correct target cleanup and protected final terminal.
- AC-002 [REQ-002]: Git/Web/Files/Network show their own confirmation text; reducer and close request share eligibility.
- AC-003 [REQ-003]: Native surface identity tests reject hidden, disposed and wrong-block events; macOS native probes cover menu and guest shortcut/repeat behavior. Windows adapter is checked against installed WebView2 types; report native validation limits.

## Behavior Delta

### MODIFIED

- REQ-001: Close shortcuts previously rejected every non-terminal block; all closable current block types now use their existing header-close behavior.
- REQ-002: Generic fallback previously described Git as a terminal; each block now has accurate close text.
- REQ-003: Ctrl+W inside native web content previously never reached the main shortcut controller; native adapters forward a source-bound close request.

## Implementation

Shared eligibility and confirmation model live in workspaceClose, consumed by reducer and Shell; shortcut hook remains the routing/guard owner. Native surface coordinator resolves live guest ownership; transport only delivers a nullable source label. Swift/WebView2 own trusted keyboard capture. No persistence/dependency/permission changes. Budget: shared close model <100 lines, hook <120, native adapters <100; shrink Shell baseline as close text moves out.

- [x] Extend eligibility, close text, shortcut names and tests.
- [x] Route native guest close commands with current surface identity and teardown protection.
- [x] Run focused/full frontend checks, native macOS probes and Rust gates; update structural map.

Embedded quality check: PASS. Existing module boundaries and close workflow are reused; regression protection targets source identity, confirmation and session cleanup. Editable inputs retain current protection; native guest focus must not be blocked by stale host-document focus.

## Verification

- AC-001: Shell integration runs all five block types through DOM and native entry paths, connected and disconnected states (20 combinations). It checks per-type confirmation, cancel/retry, exactly one block's cleanup, closeBlock dispatch and no window-close call. Hook regression tests cover all leaf types and retain the last-terminal/modal/lock/editable/repeat guards.
- AC-002: Shared `canCloseBlock` is used before requesting cleanup and by the reducer; tests protect unknown IDs and the final terminal. Git, Files, Network and Web now have type-specific titles/details/subtitles. Web confirmation explicitly covers every tab in the block.
- AC-003: Coordinator tests accept only attached visible guest generations and reject hidden, inert, removed and disposed surfaces. Hook tests reject unknown/wrong-block source labels and allow a focused native guest despite stale host input focus. Scoped native subscription teardown/current-callback regression remains passing.
- `pnpm check` passed: 243 Vitest files / 1451 tests; 27 Node tests; lint, TypeScript, Vite production build and size check. Existing 2 skipped tests and canvas/chunk-size warnings remain unchanged.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, and `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features` passed on macOS (374 Rust tests, 6 pre-existing environment-dependent ignored tests).
- Native AppKit menu probe passed via `cargo run --manifest-path src-tauri/Cargo.toml --example macos_block_close`: one custom Command+W owner, correct dispatch, repeat protection, surviving window, preserved Command+Q binding and normal window close.
- Native WebKit probe `src-tauri/examples/macos_web_block_close.swift`, compiled with all production Swift sources and WebKitPolicy.m, passed Ctrl+W source forwarding, exact modifiers, repeat suppression, blocked/hidden protections and monitor disposal. The fixture explicitly releases keys and restores focus after unhiding, matching a new user interaction. It uses an ephemeral store and no user sessions.
- Windows WebView2 forwarding is implemented with a controller-owned AcceleratorKeyPressed handler, SetHandled and WasKeyDown repeat filtering. The installed WebView2/windows binding signatures were inspected. This macOS host has only aarch64-apple-darwin installed; Windows compilation and physical-key validation remain unverified. Recheck on Windows with `cargo clippy --all-targets --all-features -- -D warnings`, then focus a webpage in a Web block and press Ctrl+W; verify that only that block closes (or prompts for its connection), with the main window and other blocks retained.
- Final diff whitespace check and source-size check passed; Shell baseline shrank with confirmation ownership extraction. No dependency, permission, persistence or packaging changes. Native changes require rebuilding/restarting the app; installed Qterm and its live sessions were left untouched.

Native guest probe reproduction from repository root:

```sh
xcrun clang -fobjc-arc -c src-tauri/src/infrastructure/web/macos/native/WebKitPolicy.m -o /tmp/qterm-web-block-close-policy.o
xcrun swiftc -swift-version 5 -import-objc-header src-tauri/src/infrastructure/web/macos/native/WebKitPolicy.h /tmp/qterm-web-block-close-policy.o src-tauri/src/infrastructure/web/macos/native/*.swift src-tauri/examples/macos_web_block_close.swift -o /tmp/qterm-web-block-close-probe
/tmp/qterm-web-block-close-probe
```
