---
schema: 1
id: QB-20261024-windows-web-block
type: feature
tier: strict
status: archived
created: 2026-10-24
updated: 2026-10-25
supersedes: []
---

# Windows Web Block

Authorization: user requested implementation and verification on Windows after accepting the native WebView + independent SSH proxy design.

- REQ-001: Remote terminal can open an adjacent Web Block bound to its profile. Existing terminal remains independent. Other platforms show unsupported state.
- REQ-002: Web owns a Network-purpose SSH session, reusing existing route authentication and host-key checks. HTTP(S), remote DNS and remote loopback traverse its private SOCKS5 listener; no direct fallback.
- REQ-003: Untrusted pages cannot call application IPC or open internal/local protocols. Browser contexts are isolated per Web instance. Popups/downloads are denied in this first release.
- REQ-004: Resize, workspace switch, overlays and lock hide or reposition native content. Close/disconnect releases the native view and proxy. Late results cannot resurrect a closed view.
- REQ-005: Persist only Web block identity and profile, never URL, browser state, proxy port or session. Existing workspace documents remain readable.

## Acceptance

- AC-001 [REQ-001]: Open, select, resize and close Web alongside a terminal; non-Windows cannot create a native view.
- AC-002 [REQ-002]: Real SSH fixture forwards HTTP, domain targets and concurrent requests; disconnect closes listener and active streams.
- AC-003 [REQ-003]: Reject non-HTTP(S)/credential URLs, reject IPC from guest labels, deny popups/downloads, distinct browser directories.
- AC-004 [REQ-004]: Native Windows test checks content, resizing, overlay/lock hiding, disconnect and cleanup; automated lifecycle tests cover stale creation.
- AC-005 [REQ-005]: Workspace round trip includes Web profile only; pre-existing layouts load unchanged.

## Behavior Delta

### ADDED
- REQ-001: Windows remote-terminal action opens Web Block.
- REQ-002: Web-specific ephemeral proxy and independent SSH runtime.
- REQ-003: Guest WebViews have no application IPC authority.
- REQ-004: Native browser surface follows workspace visibility and lifecycle.
- REQ-005: Additive Web layout variant, with browsing addresses deliberately runtime-only.

## Review

PASS WITH NOTES: requirements/acceptance coverage complete. Native rendering and WebView2 networking require Windows evidence; do not claim other-platform support. Existing schema v10 remains readable; older binaries cannot read layouts containing the new variant. Rollback requires closing Web blocks before downgrade. No persistent credentials or user configuration are changed for verification.

Architecture gate: pure URL/visibility rules in feature/domain; SSH proxy in forwarding adapter; native WebView adapter owns host views; commands validate and delegate; existing network controller owns authentication. No sharing of terminal handles.
Growth budget: new cohesive modules below source-size limits; extract layout rendering/persistence records before growing existing baselines. Baseline check passed before edits.
