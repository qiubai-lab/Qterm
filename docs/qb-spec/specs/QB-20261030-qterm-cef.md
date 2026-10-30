---
schema: 1
id: QB-20261030-qterm-cef
type: design
tier: strict
status: active
created: 2026-10-30
updated: 2026-10-30
supersedes: []
---
# Qterm CEF integration on dev-cef

Authorization: user explicitly requested integrating Tauri 3 + CEF into Qterm on dev-cef, reusing proven RequestContext ownership and OpenSSH tests, adding connection-close cleanup. No publish, push or merge into dev is requested.

Scope: the real desktop composition root and Web Block adapter, dependency/build entrypoints, native browser lifecycle, and integration evidence. macOS is the available native verification host; shared CEF code targets desktop platforms, but no Windows/Linux runtime success will be claimed without execution. Existing SSH authentication, host-key policy, terminal/file/network services, browser IPC DTOs and frontend layout remain intact. Existing WebKit/WebView2 browser data must not be silently opened as CEF data. Rollback uses the old branch/build and preserved old browser directories, without deleting user data.

## Behavior Delta
### MODIFIED
- REQ-001: The Qterm shell and embedded Web Blocks run on pinned Tauri 3 + CEF, replacing system-webview runtime; remote pages keep original HTTP(S) localhost origins without alias rewriting.
- REQ-002: Pages in the same connection environment share one native RequestContext and immutable gateway; opening or closing sibling pages does not interrupt existing HTTP or WebSocket traffic. Different browser identities and local browsing remain isolated.
### ADDED
- REQ-003: Closing/disconnecting the last SSH session owning an environment closes its pages, stops forwarding and active network work, flushes cookies, and retires the context pool entry. Reopening creates a usable context with the intended persisted cookies. Cleanup is idempotent and does not terminate other connections.
- REQ-004: Guest pages cannot invoke app/plugin commands or navigate to app-internal URLs. No remote failure falls back to local networking. Sandbox and native credential protection remain enabled in normal builds; test-only control cannot be enabled at runtime in a normal artifact.
- REQ-005: Browser navigation, visibility, focus, previews, data clearing and managed popup boundaries remain represented through existing Web Block APIs; unsupported CEF operations must fail explicitly, never claim success.

## Acceptance
- AC-001 [REQ-001]: Build and launch the full Qterm app with CEF, load the real frontend and invoke a harmless authorized command; runtime/CLI/plugin versions and packaging steps recorded.
- AC-002 [REQ-001, REQ-002, REQ-004]: Real disposable OpenSSH fixtures pass localhost Host/origin, Cookie, page/worker WebSockets, storage isolation and no-local-fallback sentinels using the production browser adapter.
- AC-003 [REQ-002]: Repeated sibling page creation while two connections issue HTTP and keep established WebSockets produces zero failures; CEF is_same verifies reuse and is_sharing_with rejects cross-connection sharing.
- AC-004 [REQ-003]: Closing one connection while another remains active retires its guest/context/gateway resources; repeat close and reopen preserve expected cookies, no leaked listeners, and unaffected connection traffic. Application exit releases native references before CEF shutdown.
- AC-005 [REQ-004, REQ-005]: Guest authorization and internal-navigation denial, browser action/visibility/preview/data-clear tests pass; existing frontend and Rust checks remain green, or exact external platform limitations are recorded without claiming coverage.

## Risks and constraints
CEF alpha upstream APIs require a checksum-pinned local patch. Patch ownership is moved to build tooling, not global Cargo cache. Existing v2 plugins must migrate together. Native close is asynchronous; pool retirement must wait for actual browser closure and must serialize against reopen. CEF context identity is runtime state, never serialized. Profile disk data remains separate from native context lifetime. Browser roots remain below CEF root_cache_path and separate from the main UI. Test hooks are a compile-time feature with isolated roots and synthetic credentials only.

## Review
Independent review found ownership/retirement and popup compatibility acceptance gaps. Ownership/security clarified below; popup UX decision requested asynchronously. Runtime/dependency and connection-lifecycle work may proceed independently; popup behavior now explicitly authorized below.

## Ownership and failure semantics
Each successful authenticated browser open registers its Network session as an environment owner (BrowserIdentity = profile + authenticated route/account). Owners persist after the last tab closes, until the session disconnects. Disconnect of one owner closes only that session's pages and removes its routes; same-identity surviving owners keep the native context and gateway. Final-owner disconnect retires the environment. Local browsing retires on final page close. A serial lifecycle lock orders open/close/retire; failed native-close or cookie-flush quarantines that generation, keeps it unavailable to reopen, and reports error. Late callbacks cannot evict another generation.
AC-006 [REQ-002, REQ-003]: Two sessions sharing one identity and a third independent identity retain correct surviving traffic when one owner disconnects; final-owner retirement works with zero pages. Failure injection covers late/failed close and retry without replacing the context prematurely.

## Preserved security and interaction
Remote context starts with a rejecting proxy, is bound once before guest navigation and remains SSH-bound for workers, restored Service Workers and popup descendants. No direct/non-proxied UDP WebRTC, no certificate verification bypass, no credential IPC to guests. TLS errors retain default verification. On retirement, proxy/gateway are blocked before asynchronous browser shutdown.
AC-007 [REQ-004]: Restored Service Worker startup is not directly networked, existing/new remote WebSockets and workers remain bound to the gateway, guest application/plugin IPC is denied, internal origin navigation is denied, and shutdown/reopen cannot reach IPv4/IPv6 localhost sentinels.
Required browser operations: back/forward/reload/stop/navigation, visibility and input occlusion, focus, snapshot, metrics, cookie/cache/site-storage selective clear and isolation. Popup POST/opener/context inheritance must be retained; current CEF alpha cannot transplant native popups into existing Tauri webviews (verified upstream life_span.rs), user explicitly chose independent native popup windows on 2026-10-30. It will not be silently degraded to GET.

User-approved compatibility delta: CEF popups use independent native windows instead of Web Block tabs. POST/window.opener, native context inheritance, user-gesture admission, internal-navigation denial, bounded popup count and parent-close cleanup remain required. Runtime-native family cleanup owns these windows; the obsolete internal-tab accept IPC fails explicitly if invoked with a stale pending request.
AC-008 [REQ-002, REQ-004, REQ-005]: A user-activated native popup retains POST body and opener with its source context; independent B remains isolated, source/connection close tears down descendants, and automatic non-gesture popup requests are blocked.

Strict review: PASS WITH NOTES by independent reviewer. Existing streams on a disconnected same-identity SSH owner may close; no TCP migration is promised. Cookie persistence verification uses Max-Age cookies.


## Verification update — 2026-10-30
User explicitly requested completing nested-popup and live-main-window teardown,
then rebuilding and reporting package size, memory and remaining limitations.
That verification scope is complete; the broader migration stays active for the
explicit parity and security-timing coverage gaps below. No acceptance is silently
removed or relaxed.

Evidence: [native/build/memory report](../../../scripts/cef/evidence/2026-10-30.md),
[checks and hashes](../../../scripts/cef/evidence/verification.json),
[normal artifact](../../../scripts/cef/evidence/package.json).

| Acceptance | Verification | Outcome / boundary |
| --- | --- | --- |
| AC-001 | VER-001 | Pass on macOS arm64: real Qterm UI and trusted IPC, normal app/DMG build, signature and image verification. System keychain runtime not exercised. |
| AC-002 | VER-002 | Pass for disposable OpenSSH localhost checks, page/worker WebSockets, Cookie/storage isolation and zero direct fallback sentinel hits; real Qterm russh path also exercised at fixture target ports. |
| AC-003 | VER-002 | Pass: native context identity and 12 sibling opens/closes with zero HTTP errors and original WebSockets intact for A/B. |
| AC-004 | VER-003 | Pass: close/retry/reopen, Cookie persistence, pool retirement and main-window exit with live resources; gateways and captured CEF helpers gone. |
| AC-005 | VER-004 | Partial: app/plugin guest denial, navigation, snapshot/metrics, Cookie/cache clear and repository gates pass. Full native interaction parity remains unverified; whole-profile site storage selection explicitly fails before mutation. |
| AC-006 | VER-005 | Pass: authenticated shared identity, survivor, zero-page final-owner close and injected close-failure quarantine/retry. |
| AC-007 | VER-005 | Partial: network gate rejects page/worker requests, direct fallback sentinels remain untouched, SW storage isolation and guest denial pass. Autonomous disk-restored Service Worker startup before page creation lacks a direct timing probe. |
| AC-008 | VER-005 | Pass: native POST/opener/route inheritance and gesture policy, 40 popup cycles per run with nested/intermediate/root teardown; B unaffected. |

Two runs of the same integration binary each passed 139 checks. The ordinary
non-test artifact was rebuilt afterward and contains no harness markers. A quiet
five-sample-per-stage process-tree memory run uses the verified test artifact;
exact limitations and numeric results are retained in evidence. No installation,
publish, merge, push or data migration was performed.
