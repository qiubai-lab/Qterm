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
- Edge UA: first HTTP request and navigator.userAgent agree for direct/SOCKS pages and their native popup children before/after adoption. These checks also run in navigation-only mode without mouse injection.
- Native occlusion/input blocking and focus release; user-clicked popup adoption, POST body/opener/about:blank, window.close, automatic-popup denial, per-source capacity, rejection, expiry and source navigation/closure cleanup.

For focused navigation/network/store checks without desktop mouse interaction, run `python3 scripts/macos-web-smoke/fixture.py --navigation-only`. This mode still uses the real WebKit adapter, including script-loop detection and recovery, but skips popup mouse tests.

The SOCKS fixture observes browser destination names. The production gateway's actual alias decoding and unchanged port/payload/SSH-reply forwarding are independently tested in `macos/tunnel.rs`; fixed alias boundaries live in `domain/web_tunnel.rs`. This is component integration, not a test against a user's real SSH server or production login provider.

Validated 2026-10-26 on arm64 macOS 26.6.2 (25G83), SDK 27.0. The fixture passed with a snapshot visually inspected. A timing failure in the synthetic-click fixture was corrected by explicitly activating the AppKit application before clicking; automatic popup testing uses a real page-load timer rather than evaluateJavaScript, which WebKit treats as a user gesture.

Not validated here: Intel runtime, macOS 14 runtime, full Qterm window visual composition, real OAuth flows, trusted HTTPS endpoint integration and signed/notarized release bundles. `cargo build` verifies application/native-adapter linking. `pnpm tauri build` is blocked on this machine by the repository's pinned macOS SDK 26.5 requirement; install/select that SDK and rerun for release qualification. The runtime guard on the WebRTC SPI must be rechecked on future WebKit versions. Product compatibility details are in `docs/browser-storage.md`.

Navigation-loop follow-up (2026-10-26): the focused mode passes ordinary redirects, changing-query script-loop termination, stop latching, manual/data-clear recovery, native error detail and provisional-history checks. Full-suite reruns encountered nondeterministic synthetic mouse delivery in popup tests (POST/about:blank/initial click); those failures are not counted as passes. The production scripts with a fresh UUID store reached Baidu's verification page, without reproducing the user's persistent white-screen loop. That investigation used the original WebKit UA and did not bypass captcha or delete user cookies. The subsequent Edge UA policy is documented in `docs/browser-storage.md`; it is not a captcha workaround.

## Tauri window editing shortcuts

Run `cargo run --example macos_web_edit` from `src-tauri/` on an interactive macOS 14+ desktop. Keep the isolated test window focused until the process exits. This uses the production Tauri Edit menu and Swift guest, with an empty local fixture and a throwaway store UUID; it does not load Qterm profiles, workspaces or remote pages. It snapshots all available pasteboard item formats and restores them on completion or assertion failure.

Coverage includes Command+A/C/X/V/Z/Shift+Z, Unicode/multiline paste, native contenteditable and iframe editing, ordinary typing and unrelated page shortcuts, Command+W / Control+W ownership, and host input focus when a guest is hidden or blocked. The AppKit-only smoke is insufficient for this regression: the original child WKWebView delivered Command+A to JavaScript but did not execute the Edit menu action in the Tauri window. `BrowserWebView` yields the explicit native menu chords to AppKit while retaining WebKit handling for other keys. Standard editing chords consequently use native menu semantics; custom JavaScript editors that replace these same chords need their own compatibility coverage.

For terminal regressions as well as browser editing, run `node scripts/macos-web-smoke/native-edit.mjs` from the repository root. It transpiles the production TypeScript clipboard adapter into a temporary fixture and runs the same native example with real xterm. Checks cover Command+V and Command+Shift+V with text and a native PNG pasteboard, exactly one application paste request with no raw xterm input, Command+A/C on terminal output, Control+C/A/Z passthrough, ordinary input select/paste/undo, and disconnected-terminal paste suppression. The application callback is a recording stub; local clipboard preparation, remote upload completion ordering, failures, and multiline confirmation are covered separately in `TerminalInput.test.tsx`. No remote upload or shell command runs in the native fixture.

The macOS Select All menu now asks a focused host terminal to select its virtual buffer; all other responders retain native selection. Windows has no macOS Edit menu and its native guest accelerator intercepts only exact Control+W. Windows Control+V/Control+Shift+V and native paste are covered by frontend behavior tests; a physical Windows/WebView2 run is still required for runtime qualification.
