# Desktop remote runtime verification

The desktop build uses bundled UI with native device capabilities and a private Rust loopback API bridge. No remote HTML is given native IPC permissions.

## Automated checks

- `pnpm check`: source-size, ESLint, Vitest, TypeScript and desktop frontend production build.
- `pnpm test:web`: existing browser runtime regression suite.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features`: includes native bridge cookie isolation, exact Origin and private path admission, redirect exclusion, binary/text WebSocket forwarding, revocation and directory drop collection.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`.
- `pnpm tauri build --debug --bundles deb`: Linux AMD64 desktop package smoke build; not a release build.

## Interactive evidence

BetterWright exercised the desktop frontend at 1040 × 720 and 720 × 520 against an isolated real `qterm-server` process and the actual Rust bridge. Its Tauri invoke boundary was stubbed for connection bootstrap and native window/clipboard calls, because Chromium is not a Tauri WebView. The bridge and server used real HTTP/WebSocket transport, native Cookie storage and server-side PTY.

Verified login, terminal command execution, refresh with the same retained session ID, native clipboard adapter selection and text delivery, environment menu, saved server editor, and constrained-window layout. `environment-menu.png` shows the real terminal command result; `server-manager-720.png` shows the minimum supported desktop window layout. Screenshots predate the final list-selection motion polish.

This does not constitute a Windows/macOS WebView or operating-system clipboard integration test. Native WebView loopback-origin behavior, file dialogs, platform clipboard formats and native dragging should receive platform smoke testing before release.
