# Native popup tab verification

Windows verification on 2026-10-25 for `QB-20261025-web-popup-tabs`.

**Correction after user reproduction:** this run omitted the opener plugin installed by the real application. It therefore proved native adoption in isolation, but did not prove production `_blank` anchor clicks: the default plugin cancels them before a native popup request exists. See follow-up `QB-20261025-web-opener-interception` for the reproduced failure and shared-production-plugin regression coverage. The original results below are preserved as historical evidence, not end-to-end production verification.

## Native and live-site evidence

`cargo test --manifest-path src-tauri/Cargo.toml native_webview_smoke -- --ignored --nocapture --test-threads=1` passed with `QTERM_WEB_LIVE_BAIDU=1`.

The default smoke uses temporary local browser data and HTTP/SOCKS fixtures. Its new popup cases exercise the production native event/deferral and child-creation code. The local cases also use production `WebHost` adoption; the remote fixture uses the native adapter with its isolated SOCKS environment (no live SSH credentials).

- Clicked `_blank` anchor, `window.open`, POST form body preservation, and blank-window-then-navigation all passed.
- The child retained `window.opener`, shared local site storage and denied application IPC; the source URL remained unchanged.
- A remote child accessed the test domain through the source SOCKS fixture and never the other fixture.
- Script-requested child close emitted the matching tab-close event.
- Duplicate adoption, explicit rejection, source navigation, source closure and the real 15-second expiry all released the request. Automatic load-script popups were blocked after synthetic test user activation expired.

The opt-in live check then loaded `https://www.baidu.com/`, activated the actual homepage `_blank` news anchor, adopted its native request and observed successful navigation to Baidu News while retaining the homepage. These are native WebView captures from the isolated test window, not screenshots of the complete Qterm workbench:

- [Preserved Baidu homepage](baidu-source.png)
- [Loaded Baidu News child](baidu-popup.png)

To repeat the live portion in PowerShell, set `$env:QTERM_WEB_LIVE_BAIDU = '1'` before the smoke command. Leave it unset for offline fixture-only verification. The live check depends on the public site's availability and markup.

## Frontend evidence

- `pnpm check` passed: 227 test files / 1335 tests passed; 1 file / 2 tests skipped. Script tests, ESLint, TypeScript and Vite build passed; existing bundle-size advisory remains.
- After fixing the initially blank popup's loading state, the two affected test files passed all 10 tests; focused ESLint and `pnpm build` passed again.
- Additional focused tab test confirms two native close events in the same batch remove both pages.
- `WebBlock.test.tsx` covers the complete React chain from a matching native guest event through WebTabs to the adoption IPC, retaining the remote target and never replaying the URL.
- `webPopupEvents.test.ts` covers live-generation routing, duplicate events, capacity feedback/rejection, late cleanup, partial subscription failure and close routing.
- `useWebPopupBrowser.test.tsx` covers listener-before-adoption ordering, StrictMode single consumption, failed acceptance and unmount while acceptance is pending.

## Acceptance mapping

Rust `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` passed. The full `cargo test --all-targets --all-features` run (two threads, then a serial retry) returned **360 passed, 1 failed, 7 ignored**. The only failure is the unchanged `infrastructure::local::pty::tests::default_shell_routes_terminal_io_and_can_be_closed`, at `src-tauri/src/infrastructure/local/pty.rs:424`: the shell executed commands and emitted `ESC[3J`, but its cursor output did not include the exact `ESC[H` expected by that assertion. The terminal source directory has no changes. This is a remaining repository-wide check failure; the popup feature's native/domain/frontend checks passed. Reproduce that case with `cargo test --manifest-path src-tauri/Cargo.toml default_shell_routes_terminal_io_and_can_be_closed -- --test-threads=1`.

Source-size checks passed with zero ratchet reminders, and `git diff --check` passed. Initial native fixture failures were corrected by respecting deferred script execution and waiting for page readiness / expiration of synthetic user activation; no production popup policy was relaxed to pass them.

| Acceptance | Verification |
| --- | --- |
| AC-001 Native semantics and target inheritance | Native popup fixture, opt-in Baidu check, React block/tab integration |
| AC-002 Popup policy and guest restrictions | Domain policy tests, native automatic-popup/IPC/proxy cases, matching-generation frontend events |
| AC-003 Lifetime and failure handling | Native reject/navigation/close/expiry/single-use cases; tab capacity, same-batch close, failure, StrictMode and listener cleanup tests |

No new dependencies, persisted popup state, remote-profile migration or packaging change. Existing tracked evidence images were restored after the shared smoke refreshed them.
