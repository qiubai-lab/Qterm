# Opener interception follow-up verification

Windows, 2026-10-25. Follow-up to the user's `opener.open_url not allowed` screenshot after QB-20261025-web-popup-tabs.

## Root cause and reproduced failure

Pinned `tauri-plugin-opener` 2.5.4 defaults `open_js_links_on_click` to true. Its `src/init-iife.js` installs a window click listener, calls `preventDefault()` for HTTP(S) blank-target anchors, and invokes `plugin:opener|open_url`. Guest capabilities correctly reject this command, but the canceled browser action never creates `NewWindowRequested`.

The earlier native smoke did not register this production plugin. Its passing native handoff results did not prove the production anchor click path. This limitation is now noted in the original evidence record.

Reproduction: first shared the existing default plugin between the application and native smoke, without changing its behavior. `native_webview_smoke` then failed at the local blank-target anchor waiting for a native popup request (0 passed / 1 failed, 20.92 seconds). The earlier window.open remote case still passed. The failure log is `.web-opener-red.log` in the local checkout.

## Correction and behavior protection

`infrastructure/external_links.rs` disables only the plugin's automatic click script. The plugin remains installed, its explicit commands remain available to trusted UI, and capabilities are unchanged. The about dialog's project anchor now uses the same explicit HTTP-opening boundary as terminal confirmations and Markdown preview; a failed launch reports an error and supports retry.

Native smoke uses this same factory. Local, remote-proxy and real Baidu anchors are clicked with WebView2 `Input.dispatchMouseEvent`, rather than JavaScript `element.click()`. Source-document assertions require `isTrusted === true`, `defaultPrevented === false`, and no unhandled rejection. Explicit guest `plugin:opener|open_url` calls must still return `opener.open_url not allowed`; the test also asserts the real plugin state is installed.

The post-fix native smoke with `QTERM_WEB_LIVE_BAIDU=1` passed (1 passed, 0 failed, 53.19 seconds), covering:

- Local and source-SOCKS anchor handoff with original page retained; the second proxy receives no child request.
- Real Baidu homepage news anchor opening and successfully loading the child, without automatic opener interception or rejection.
- Existing window.open, POST body, blank-then-navigation, opener/storage, guest IPC, popup rejection/expiry/cancellation, and native page lifecycle checks.

Captures from the isolated native test window, visually inspected:

- [Baidu source page retained](baidu-source.png)
- [Baidu News child loaded](baidu-popup.png)

These are not complete workbench screenshots. A separate full-workbench mouse check was not completed: the desktop automation runtime failed initialization (`failed to write kernel assets`, OS error 3). The native click tests and React block-to-adoption integration tests supply the available acceptance evidence. No live SSH credentials or user browser profile were used by the smoke.

## Reproduction commands

```powershell
$env:QTERM_WEB_LIVE_BAIDU = '1'
cargo test --manifest-path src-tauri/Cargo.toml native_webview_smoke -- --ignored --nocapture --test-threads=1
Remove-Item Env:QTERM_WEB_LIVE_BAIDU
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- --test-threads=2
```

Leave the live-site variable unset to run only isolated fixture checks. The live check depends on Baidu availability/markup. This is native initialization code: rebuild/restart the desktop executable to apply it; refreshing a guest page inside an old process is insufficient.

## Repository checks

- `pnpm check`: passed; 227 test files / 1336 tests passed, 1 file / 2 tests skipped; all 21 script tests passed, along with ESLint, TypeScript and Vite build. The about-link failure/retry test and existing terminal/Markdown/external-opening tests pass.
- Rust fmt and Clippy (`--all-targets --all-features -- -D warnings`): passed.
- Rust full suite (`--all-targets --all-features -- --test-threads=2`): **361 passed, 0 failed, 7 ignored**, 106.89 seconds. The previously failing terminal clear-screen case passed this run; no terminal code/assertion was modified.
- Source-size check: passed with zero ratchet reminders. `git diff --check`: passed.

AC-001 is protected by local/remote/Baidu trusted pointer clicks with the shared production plugin; AC-002 is protected by explicit-opening frontend tests, real installed plugin state, and native guest permission rejection. No dependency, Tauri capability/configuration, persistence or packaging changes; no release bundle was built.
