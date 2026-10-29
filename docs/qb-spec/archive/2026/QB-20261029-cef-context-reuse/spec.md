---
schema: 1
id: QB-20261029-cef-context-reuse
type: bugfix
tier: standard
status: archived
created: 2026-10-29
updated: 2026-10-29
supersedes: []
---

# Reuse native CEF RequestContext within each SSH connection

Authorization: the user explicitly requested continuing on `codex/tauri3-cef-probe`, fixing same-connection window creation interruptions, validating native RequestContext reuse with existing OpenSSH tests, and leaving production unchanged.

## Requirements

- REQ-001 / AC-001: Opening/closing same-connection windows must cause zero failures in continuous HTTP and no close/reconnect of pre-existing WebSockets, with simultaneous A/B traffic through real authenticated OpenSSH.
- REQ-002 / AC-002: Windows of one connection must reuse the identical CEF RequestContext (`is_same`, not only `is_sharing_with`); A and B must neither be identical nor share storage. Reopening after all A windows close must retain the same connection-owned context. Proxy binding must be set once and conflicting routes rejected before window creation.
- REQ-003 / AC-003: Existing native Cookie, worker WebSocket, CSP, browser storage, logout, SSH cut/recovery and IPv4/IPv6 no-fallback checks must remain green.
- REQ-004 / AC-004: Any runtime patch is pinned, checksum-verified, reproducible and confined to the experiment. Strong context ownership ends before CEF shutdown. Deliver a tested macOS bundle, source checks, native evidence and limitations; production paths remain unchanged.

## Behavior Delta

### MODIFIED
- REQ-001: Replace tolerated transient failures during same-profile creation with uninterrupted traffic.
- REQ-002: Replace separate contexts sharing a cache path with one initialized native context per explicit profile path and a connection-owned immutable proxy binding.

## Design and module budget

The published runtime has no existing context injection/reuse API. Apply a minimal local patch to the exact published runtime archive, extracted into an ignored build dependency directory; keep the patch and its small context-pool module tracked. The pool owns native contexts on the CEF UI thread, joins pending initialization, applies preferences only on first creation, and releases references before CEF shutdown. Shared custom-scheme factories still use the runtime's browser-indexed handler registry. Incognito/default contexts are not pooled. Per-webview proxy_url is rejected for pooled contexts to avoid silently mutating another window's routing.

The experiment's connection owner binds each profile to one gateway and native context; new windows verify native identity and proxy preferences without reapplying them. Native handles retained by the connection owner are cleared in the Tauri Exit event before runtime pool teardown. No global mutable CEF preferences, unsafe casts or network API replacement are added. New owned source modules target <200 lines; third-party source remains generated from the verified archive rather than maintained as a large fork.

## Plan and verification mapping

- [x] AC-001: Add strict zero-failure / uninterrupted-socket regression, run against 0.1.0 to capture failure before implementation.
- [x] AC-002, AC-004: Implement initialized context pool, connection binding and native identity evidence; compile/fmt/Clippy.
- [x] AC-001, AC-003: Run full OpenSSH matrix with repeated same/different-connection windows, including creator close and reopen.
- [x] AC-004: Review lifetime/isolation, package and verify signatures/DMG; update report and archive evidence.


## Acceptance evidence and residual scope

| Acceptance | Evidence |
|---|---|
| AC-001 / REQ-001 | `evidence/context-baseline.json` reproduces A 81 / B 75 failures during window churn. `context-first-pass.json` passes 94/94; final `context-reuse-results.json` passes 97/97 with A 172 / B 166 successful continuous HTTP requests and original sockets still open without reconnect. |
| AC-002 / REQ-002 | 19 guest windows, two first contexts and 17 verified native reuses; app compares `is_same`, checks cross-connection `is_same` and `is_sharing_with`, and reads unchanged proxy preferences. Creator-close survivor HTTP (27/27) and WS pass. Closing all A windows and reopening preserves native identity. Wrong gateway is rejected and no window exists. |
| AC-003 / REQ-003 | Final 97-check matrix includes every previous Cookie/worker/CSP/storage/SSH failure-recovery case; IPv4 and IPv6 sentinel counts are zero. |
| AC-004 / REQ-004 | `context-reuse-verification.json` records upstream archive/patch/source hashes, Clippy, signature/DMG checks and read-only mounted binary identity. `context-interruption.json` proves two owner + two pool handles released and no leaked app/SSH/sshd processes on interruption. Format/Python/source-size checks pass. |

Independent review found no critical/important source issue. Build tooling now documents Python >=3.12. App Clippy passes with warnings denied; the upstream runtime dependency retains an existing unused `devtools_enabled` field warning, recorded verbatim. Runtime stderr diagnostics are retained in verification evidence; assertions/exit status, not absence of logs, determine native acceptance.

The pool's pending-initialization join is source-reviewed but not directly covered by simultaneous first creation: this trusted stdin controller serializes opens. Runtime patch scope is explicit persistent `data_directory` profiles; incognito/default remain upstream behaviour. Connection state remains owned until app exit, not until the last window closes. This bounded two-connection prototype deliberately does not implement production connection retirement/eviction; final closed-window footprint is 315.3 MiB after the larger test workload. Production integration still needs lifecycle retirement, real remote/framework coverage, persistence/restart, signing/Keychain and other platforms. No production source, dependency, or configuration was changed.
