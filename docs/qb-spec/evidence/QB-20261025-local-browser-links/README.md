# Local browser and terminal link verification

Verified on Windows, 2026-10-25, for `QB-20261025-local-browser-links`.

## Coverage

| Acceptance | Evidence |
| --- | --- |
| AC-001 Local browsing and storage | `WebBlock`, `useWebBrowser`, `WebBrowserPane` tests; native Local/Remote DTO validation; local storage/remote manifest compatibility; library scope tests; real native local fixture |
| AC-002 Source-aware opening | Terminal plain-link/OSC 8 adapters, confirmation origin snapshot, `useWebOpenController` tests for source workspace, captured target, deletion, same-target reuse and transient command consumption; `WebTabs` empty/new tab and capacity cases |
| AC-003 Destination dialog | Component/style tests for icons, close/Escape, failure/retry, duplicate submission and stale completion; visual checks below; local native modal covering fixture |
| AC-004 Isolation and regression | Full frontend/Rust checks; explicit local arguments vs unchanged remote proxy arguments; real WebView2 local lifecycle, remote proxy isolation and denied guest IPC |

## Checks

- `pnpm check` passed: 224 test files / 1325 tests passed, 1 file / 2 tests skipped; 21 script tests passed; ESLint, TypeScript and production Vite build passed. The existing chunk-size advisory remains.
- Two source-block adapter tests were then added: `pnpm exec vitest run src/terminal/terminalWebLinks.test.ts src/terminal/terminalOsc8Link.test.ts` passed 6 tests; focused ESLint passed.
- `pnpm check:source-size` passed with zero ratchet reminders after final changes.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- --test-threads=2` passed: 360 passed, 7 environment-dependent tests ignored.
- `cargo test --manifest-path src-tauri/Cargo.toml native_webview_smoke -- --ignored --nocapture --test-threads=1` passed. Rerun after stronger readiness assertions and separate screenshot destinations also passed.
- `git diff --check` passed.

## Visual inspection

These four captures render the production React components in an isolated browser fixture with sample origin data; they are UI evidence, not a claim that the complete desktop app was manually exercised. The temporary fixture and its server were removed after checking.

- [Cyberpunk link dialog](link-dialog-cyberpunk.png): actual URI, local origin, semantic icons, two equal-width choices, no Cancel.
- [Light link dialog](link-dialog-light.png): theme contrast and control hierarchy.
- [Dark narrow dialog](link-dialog-narrow.png): 360px viewport, horizontal controls fit without overflow.
- [Local connection picker](local-connection.png): Local uses the computer's network and can be selected alongside remote connections.

At a 1280px viewport, the dialog measured 390 × 280.234375px; both action buttons measured 172 × 30px. Injecting the tab-capacity failure left dialog height unchanged. Closing returned focus to the trigger. No external browser was launched during the visual fixture check.

## Real native fixture

The native smoke uses temporary browser data, a local HTTP fixture and isolated SOCKS fixtures, not user profiles or live remote credentials. `native_local_tests.rs` opens two guests through production `WebHost` with an empty SSH session manager. It checks local network access, shared local cookies/storage, remote separation at the same origin after page readiness, denied guest IPC, sync/reload/metrics, native modal covering, data clearing and closure. Existing remote navigation/proxy/window restrictions remain in the same smoke.

- [Local guest preview](guest-preview.png)
- [Local native modal covering](modal-host.png)

No desktop release package was built: native dependencies, Tauri configuration and packaging did not change. Internal browsing retains its existing Windows-only scope.
