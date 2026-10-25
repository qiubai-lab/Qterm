# macOS native browser smoke

Run from the repository root on an interactive macOS 14+ desktop with Xcode:

```sh
python3 scripts/macos-web-smoke/fixture.py
```

The fixture compiles the production Swift/Objective-C adapter into a temporary AppKit executable. It opens a test window, uses real mouse events for popup activation, starts throwaway HTTP/SOCKS servers and removes its UUID website stores afterwards. Keep the test window available while it runs. It does not read Qterm connection profiles or require an SSH account. An optional existing directory in `QTERM_SMOKE_EVIDENCE` receives `guest.png`, captured with WKWebView's snapshot API.

Coverage:

- Visible tunnel aliases for localhost, 127.0.0.1, IPv6, IPv4-mapped IPv6 and 0.0.0.0; normal domain identity; fetch and WebSocket routing; two independent proxy/store environments at the same origin.
- Native WebRTC disablement, raw Worker loopback blocking (including alternate numeric spellings and credential-bearing importScripts), unavailable proxy failure, explicit HTTPS localhost error and absence of guest IPC.
- Local/shared/separate persistent stores, SPA metadata, forbidden schemes, metrics, PNG snapshots, selective cache/cookie/storage clearing.
- Navigation: normal 301/302 redirects, bounded script loops with changing query tokens, explicit recovery, provisional-history suppression and native network error messages.
- Native occlusion/input blocking and focus release; user-clicked popup adoption, POST body/opener/about:blank, window.close, automatic-popup denial, per-source capacity, rejection, expiry and source navigation/closure cleanup.

For focused navigation/network/store checks without desktop mouse interaction, run `python3 scripts/macos-web-smoke/fixture.py --navigation-only`. This mode still uses the real WebKit adapter, including script-loop detection and recovery, but skips popup mouse tests.

The SOCKS fixture observes browser destination names. The production gateway's actual alias decoding and unchanged port/payload/SSH-reply forwarding are independently tested in `macos/tunnel.rs`; fixed alias boundaries live in `domain/web_tunnel.rs`. This is component integration, not a test against a user's real SSH server or production login provider.

Validated 2026-10-26 on arm64 macOS 26.6.2 (25G83), SDK 27.0. The fixture passed with a snapshot visually inspected. A timing failure in the synthetic-click fixture was corrected by explicitly activating the AppKit application before clicking; automatic popup testing uses a real page-load timer rather than evaluateJavaScript, which WebKit treats as a user gesture.

Not validated here: Intel runtime, macOS 14 runtime, full Qterm window visual composition, real OAuth flows, trusted HTTPS endpoint integration and signed/notarized release bundles. `cargo build` verifies application/native-adapter linking. `pnpm tauri build` is blocked on this machine by the repository's pinned macOS SDK 26.5 requirement; install/select that SDK and rerun for release qualification. The runtime guard on the WebRTC SPI must be rechecked on future WebKit versions. Product compatibility details are in `docs/browser-storage.md`.

Navigation-loop follow-up (2026-10-26): the focused mode passes ordinary redirects, changing-query script-loop termination, stop latching, manual/data-clear recovery, native error detail and provisional-history checks. Full-suite reruns encountered nondeterministic synthetic mouse delivery in popup tests (POST/about:blank/initial click); those failures are not counted as passes. The production scripts with a fresh UUID store reach Baidu's verification page, without reproducing the user's persistent white-screen loop. No captcha bypass, UA substitution or user-cookie deletion is performed.
