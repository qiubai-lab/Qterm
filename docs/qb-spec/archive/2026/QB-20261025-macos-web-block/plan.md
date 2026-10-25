---
schema: 1
id: QB-20261025-macos-web-block
type: feature
tier: strict
status: archived
created: 2026-10-25
updated: 2026-10-26
supersedes: []
---

# macOS browser implementation and verification

- TASK-001 [REQ-001, REQ-002]: Add availability-guarded native bridge/build integration and stable UUID stores; validate actual WKWebView proxy routing before exposing capability; map remote loopback origins and SOCKS destinations, install native raw-loopback rules, and guard the remote WebRTC SPI.
- TASK-002 [REQ-003, REQ-004]: Integrate shared lifecycle with native navigation, data operations, clipping, input/focus and previews.
- TASK-003 [REQ-005]: Implement synchronous hidden popup children with bounded asynchronous host adoption, preserving request semantics.
- TASK-004 [REQ-001]: Bootstrap backend capabilities and retain existing UI composition and unsupported states.
- TASK-005 [REQ-001, REQ-002, REQ-003, REQ-004, REQ-005]: Add native fixture and adjacent regressions, run relevant repository gates, update Directory Map and browser documentation.

## Verification mapping
- VER-001 [AC-001]: Frontend capability tests, Rust capability check and guarded native build on current macOS; older runtime availability remains a recorded test limitation if unavailable.
- VER-002 [AC-002]: Isolated native browser fixture exercises two proxies/stores, shared store, unreachable gateway, remote DNS/loopback and denied guest authority.
- VER-003 [AC-003]: Native navigation/data/metrics fixture and shared Rust/browser frontend tests.
- VER-004 [AC-004]: Native view/hit-test checks plus development smoke; no visual claim without image evidence.
- VER-005 [AC-005]: Native popup fixture and existing tab adoption regressions.
- VER-006 [AC-001, AC-002, AC-003, AC-004, AC-005]: pnpm check, cargo fmt/clippy/tests, native smoke, source-size check and packaging/build checks appropriate to native bridge integration. SDK 26.5 release availability is verified separately.

## Verification evidence (2026-10-26)

- VER-001 [AC-001]: Backend local/remote capability plus mapping flag are queried before React mounts. Adjacent tests cover explicit capability, malformed/failing discovery, ordinary browsers, reset and unqualified remote states. macOS APIs are guarded at 14.0; older runtime/Intel execution was unavailable.
- VER-002 [AC-002]: `python3 scripts/macos-web-smoke/fixture.py` passed on arm64 macOS 26.6.2 (25G83), SDK 27.0. Two remote proxies at the same origin stay isolated; HTTP/WS aliases, IPv6, 0.0.0.0, normal DNS names, failed proxy and raw Worker loopback block checks pass. Native RTC is absent, forbidden schemes and guest IPC are denied. Rust SOCKS tests verify actual destination translation while preserving port, body bytes and reply. No real user SSH server or trusted HTTPS endpoint was exercised.
- VER-003 [AC-003]: Native fixture passed shared/separate/reopened storage, SPA metadata, metrics, selective clearing, loading/stop and PNG snapshot checks. Native compatibility errors reach React and clear on subsequent events. `cargo test --all-targets --all-features` passed 374 tests, 6 environment-dependent tests ignored.
- VER-004 [AC-004]: Real AppKit hit tests prove occlusion, modal input exclusion, focus release and unlock. WKWebView PNG was captured and visually inspected. Full Qterm window composition is not visually certified by this fixture; no desktop automation was available for that path.
- VER-005 [AC-005]: Native mouse-click tests passed popup POST body, opener, about:blank document writes, native close, automatic-popup denial, four-pending-per-source bound, refusal, 15-second expiry and source navigation/close cleanup. The fixture explicitly activates AppKit before synthetic clicks; automatic-popup testing originates in a document timer, avoiding evaluateJavaScript's user-gesture behavior. Existing frontend popup/adoption regressions remain covered by the full frontend suite.
- VER-006 [AC-001, AC-002, AC-003, AC-004, AC-005]: `pnpm check`, `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, native fixture and `cargo build` pass. The source-size guard includes Swift/Objective-C with zero ratchet reminders. `pnpm tauri build` was attempted and blocked by missing SDK 26.5; debug linking and native tests use installed SDK 27.0. Signed release bundles, macOS 14/Intel runtime and real OAuth/server compatibility remain release qualification items. Reproduce with the smoke README and the same repository commands after selecting SDK 26.5.

Scope review: the accepted tunnel-origin compromise replaces the initial transparent-loopback assumption. Raw unrewritten requests fail closed; TLS identity is never weakened. The WebKit SPI dependency and unsupported JavaScript panels/downloads/media are explicit compatibility limits. No global proxy settings, real account data, browser secrets or source-size baseline limits were changed. Directory Map and browser environment documentation were updated; long-lived context specifications were not rewritten.
