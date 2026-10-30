# Qterm on CEF (`dev-cef`)

This branch runs the real Qterm React application and backend on Tauri 3 + CEF.
The standalone experiment remains under `experiments/tauri3-cef-probe`; it is not
used as the application shell. Native integration is currently validated on
macOS arm64. Windows/Linux Web Block capabilities remain disabled until their
native surface adapters are implemented and tested.

## Build

Requires the repository's Node/pnpm/Rust toolchain, Python 3.12+, CMake, Ninja,
and the existing macOS SDK 26.5 requirement. Tauri CLI downloads/bundles CEF;
`CEF_PATH` and `CARGO_TARGET_DIR` may point at external build caches.

```sh
pnpm install --frozen-lockfile
pnpm tauri dev
pnpm tauri build --bundles app,dmg
```

`pnpm tauri dev/build` first runs `prepare_runtime.py`. It checks the exact
upstream crate SHA-256, applies a zero-fuzz patch, checks generated-file hashes,
and materializes the ignored `.cef-runtime/tauri-runtime-cef` Cargo dependency.
For direct Cargo commands on a fresh checkout, run the preparer first. It does
not modify Cargo's registry cache. Do not edit generated sources; edit `patches/`.

Pinned versions: Tauri 3.0.0-alpha.5, runtime-cef 3.0.0-alpha.6,
tauri-build 3.0.0-alpha.4, CLI 3.0.0-alpha.5, JS API 3.0.0-alpha.3,
CEF crate 154.5.0 (Chromium 154.0.8037.98). Plugin versions are pinned in both
lockfiles. The upstream release-build `devtools_enabled` dead-code warning is
unchanged; application clippy still runs with `-D warnings`.

The bundle is `Qterm CEF.app` / `com.qiubai.qterm.cef`. No automatic install is
performed by the commands above. Normal builds retain Qterm's configuration
locator and use OS-protected CEF secret storage. Browser profiles live in a new
`cache/cef-v1` root and do not open or delete the old WebKit/WebView2 stores.
Do not run two Qterm variants against the same writable configuration at once.

## Ownership and network boundary

- A browser identity is the existing authenticated profile + SSH route/account.
  Authenticated Network sessions are owners; tabs are not owners. Closing the
  last tab keeps the environment until its final owning session disconnects.
- Each environment has one stable loopback gateway and one native RequestContext.
  Siblings verify `is_same`, other identities verify both `is_same` and
  `is_sharing_with` are false. Sibling creation never rewrites proxy preferences.
- The proxy uses `socks5://127.0.0.1:<gateway>` with `<-loopback>`. HTTP Host,
  origin, localhost URLs and WebSocket URLs are not rewritten. Forwarding uses
  Qterm's existing authenticated SSH SOCKS path.
- A newly created pooled context has a closed IO-thread resource gate. Proxy
  binding and native identity verification open it before guest navigation.
  Requests from workers without a browser/frame also pass this gate. A rejecting
  default proxy and disabled non-proxied WebRTC UDP provide additional boundaries.
- Final-owner disconnect closes admission, rejects new proxy traffic, shuts down
  the gateway, closes native pages/popups, waits for native close, flushes cookies,
  closes connections and evicts the pool entry. Native browser counts prevent
  premature eviction. Errors retain a quarantined generation; retry cannot
  create a new context over it. Existing streams on a disconnected SSH owner
  are not migrated to a surviving owner.
- Guest app commands are rejected by the trusted-UI guard; plugin capabilities
  name only the main webview. No guest-facing test command is registered.

## Native compatibility

Popups use independent native CEF windows, as approved by the user. They retain
POST bodies, `window.opener` and the source RequestContext. Automatic popups are
rejected, native families have a bounded count and source close tears them down.
Old internal-tab popup acceptance explicitly rejects stale requests. The macOS
Alloy close path completes its native window handshake then detaches the exact
browser view; CEF 154 can otherwise retain that view after closing the window.
Popup ownership uses the root webview ID, including nested native creation.
The main UI flushes workspace state and awaits `web_shutdown` before destroying
its window; repeated close requests cannot bypass the asynchronous cleanup.

Navigation, metrics, PNG preview, Cookie and HTTP cache clearing use CEF APIs.
**Whole-profile site-storage clearing is not implemented:** CDP only clears named
origins and cannot enumerate all persisted origins. A request selecting site
storage fails before changing any data, including when combined with Cookie or
cache selection. It must not report a partial clear as a successful full clear.

The macOS adapter implements child-view bounds, overlapping visual/input
occlusions, focus events and native menu routing. Automated coverage includes
browser API calls and the shared geometry rules; full native keyboard,
file-picker and visual interaction parity remains a separate acceptance gap.
Legacy WKWebView-only examples remain as source but are excluded from this
branch's Cargo example targets because they require Tauri 2 and `QtermWeb`.

## Native OpenSSH verification

Build a **test-only** artifact separately from the normal artifact:

```sh
pnpm tauri build --features cef-integration-test --bundles app
python3 scripts/cef/tests/run.py \
  --app 'src-tauri/target/release/bundle/macos/Qterm CEF.app' \
  --output scripts/cef/artifacts/latest --samples 3
```

Adjust the app path if using `CARGO_TARGET_DIR`. `--samples 0` runs behavior checks
without memory sampling. A changing process tree invalidates a footprint sample;
the harness retries and reports any incomplete measurements separately.

The compile-time feature enables parent-owned stdin control, isolated data roots
and Mock Cookie encryption for disposable tests. **Never distribute that build.**
Normal builds have neither stdin control nor `QTERM_CEF_PROBE_DATA` support and
use System secret storage. Rebuild without the feature for the normal package.

The harness reuses disposable sshd, temporary Ed25519 keys, pinned host keys,
HTTP/WebSocket origins and IPv4/IPv6 port-3000 sentinels. Original localhost tests
use separate SSH target-port translators (SOCKS destination only; no HTTP rewrite).
A second stage uses Qterm's real russh manager, identity checks, SOCKS listener
and disconnect watcher directly against those sshd servers. It does not use
HOME-220 or any saved/user SSH connection. Temporary keys and processes are
removed on completion.

Coverage includes Cookie attributes, page/worker WebSockets, service workers,
Cache Storage/IndexedDB/localStorage isolation, continuous traffic while siblings
open/close, native popup POST/opener, close-failure quarantine/retry, final-owner
retirement, persisted Cookie reopen, guest IPC denial, internal navigation denial,
metrics/preview, Cookie/cache clearing and shared-identity session disconnect.
The suite also runs 40 popup creation/teardown cycles, including nested windows
and intermediate-parent closure. Its final exit uses the real main-window close
API with two live WebSockets and nested popups, then checks empty native ownership,
closed listeners and exited helper processes.

A separate quiet usage run measures five samples per stage without running the
stress suite or a concurrent build:

```sh
python3 scripts/cef/tests/measure_usage.py \
  --app 'scripts/cef/artifacts/verified-test-app/Qterm CEF.app' \
  --output scripts/cef/artifacts/usage-memory
```

`evidence/` records compact results; full temporary logs stay ignored in `artifacts/`.

```sh
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features
```

This branch has not been merged, installed, notarized or published. Retain `dev`
and the preserved legacy browser data for rollback. Full release readiness must
also resolve the explicit site-storage/UI gaps and validate other platforms.
