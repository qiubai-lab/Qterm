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

# macOS native browser blocks

Authorization: user accepted the macOS assessment and requested implementation. Browser features require macOS 14+, without raising the application's existing deployment target. Windows behavior remains intact. On 2026-10-26 the user explicitly accepted WKWebView tunnel address mapping and its login/hardcoded-address compatibility limits (“接受，继续实现 WKWebView 隧道地址映射”).

## Behavior Delta
### MODIFIED
- REQ-001: Replace Windows-only browser availability with backend-reported Windows/macOS 14+ capability; unsupported systems fail before allocating a guest or connection environment.
### ADDED
- REQ-002: macOS local and SSH browser targets use isolated persistent connection stores. Normal remote HTTP(S) domains and mapped HTTP/WS loopback traffic use the SSH-owned gateway; failure never selects local networking. Raw loopback loads are blocked natively, with document-start mapping for common requests. HTTPS/WSS localhost and unsupported hardcoded origins report or document compatibility limits; mapped addresses remain visible. Remote WebRTC is disabled with guarded WebKit SPI, failing closed if unavailable. Guest pages have no application IPC or custom-protocol authority.
- REQ-003: Native navigation, title, SPA source changes, loading/error/stop, selective clearing, metrics and snapshots preserve the existing browser contracts and target lifetime.
- REQ-004: Native content follows bounds, tab/workspace visibility, lock, modal input blocking, local occlusions, focus and browser frame styling; closing removes views and observers.
- REQ-005: User-initiated popup requests become tabs in the source block, preserving POST, opener and store/proxy identity. Pending children are bounded, expire, and close on refusal/source navigation/closure; automatic popups and downloads remain denied.

## Acceptance
- AC-001 [REQ-001]: Capability tests cover macOS version/unsupported/error states; Windows frontend behavior remains supported, and macOS lower-version APIs are availability guarded.
- AC-002 [REQ-002]: Native fixture verifies independent stores/proxies, shared same-store cookies, remote domains/loopback, closed proxy failure, forbidden protocols and absent guest IPC.
- AC-003 [REQ-003]: Native fixture verifies navigation/SPA/title/error/stop, snapshot, metrics, selective cache/cookie/storage clearing and lifecycle cleanup; shared Rust/frontend tests pass.
- AC-004 [REQ-004]: Native fixture verifies bounds/hide/show, modal input exclusion, occlusion hit testing and focus; inspect a real development window when desktop automation is available.
- AC-005 [REQ-005]: Native fixture verifies clicked popup POST/opener/blank handling and bounded rejection/expiry/cleanup, with frontend adoption regression protection.

## Review

PASS WITH NOTES. Every requirement has observable acceptance. macOS native guests will be owned by a dedicated AppKit/WebKit adapter, without Tauri guest IPC injection, to support synchronous popup creation. Swift uses availability-guarded public APIs plus an isolated, selector-checked WebKit SPI to disable remote peer connections and a narrow JSON/C ABI to Rust. Native store UUID mapping is persisted beside existing profile metadata; WebKit owns its storage location. Existing Windows data is unchanged. No migration, system proxy changes or credential exposure. Native fixture evidence must demonstrate mapped routing, isolation and blocked raw worker requests. Public WKWebView proxy configuration alone does not enforce loopback routing. The mapping changes origin/Host/Cookie/CORS semantics; this is the user-approved compatibility scope, documented in browser-storage.md and exposed in UI help. JavaScript panels/downloads/media remain disabled. Rollback disables macOS capability; native site data is preserved.

Architecture/growth gate: shared WebHost remains the lifecycle and connection owner; macOS view/store/navigation/surface/popup responsibilities are separate modules. Swift sources enter the repository source-size check, each below 700 lines. No hotspot baseline increase. Native runtime tests use temporary stores and local fixtures only.
