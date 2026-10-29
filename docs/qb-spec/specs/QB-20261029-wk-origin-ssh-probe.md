---
schema: 1
id: QB-20261029-wk-origin-ssh-probe
type: design
tier: standard
status: active
created: 2026-10-29
updated: 2026-10-29
supersedes: []
---

# WKWebView original-origin SSH feasibility

Authorization: user requested further Cookie, WebSocket and multi-connection validation of the previously demonstrated HTTP Scheme Handler approach, and explicitly selected independent OpenSSH testing. This change delivers feasibility evidence; production integration remains a separate implementation step.

## Scope and constraints

Keep production browser behavior, IPC and user data unchanged. Add a standalone macOS test harness with disposable WebKit stores, host/client keys, sshd and SSH master connections. Two simulated remote services share the browser-visible `http://localhost:3000` origin but use separate fixture ports on the same OS; this proves connection routing, not separate remote OS namespaces. No global proxy, hosts, route or trust configuration changes.

## Requirements

- REQ-001: Preserve original browser origin and HTTP Host/Origin through actual authenticated SSH channels.
- REQ-002: Evaluate a per-store Cookie adapter, including HttpOnly visibility, JS changes, path, deletion and credentials omission; do not present limited first-party coverage as full browser Cookie compatibility.
- REQ-003: Evaluate page and classic/module Worker WebSockets with original Origin and correct profile cookies, messages and close; expose CSP and unmapped-loopback limitations.
- REQ-004: Keep same-origin A/B stores and routes independent, including simultaneous activity and failure of A while B survives; refuse local fallback.
- REQ-005: Deliver reproducible tooling, evidence and a go/no-go assessment with remaining production requirements.

## Acceptance

- AC-001 [REQ-001]: Real WKWebView fixture receives original-origin responses over independently authenticated OpenSSH connections, with server-side Host/Origin and request-body assertions.
- AC-002 [REQ-002]: Cookie tests assert observed send/store/JS behavior and document any semantic mismatch instead of weakening assertions.
- AC-003 [REQ-003]: Page and Worker socket tests verify profile identity, Cookie and Origin at the remote fixture; CSP and native unmapped-socket controls document supported/blocked cases.
- AC-004 [REQ-004]: A/B concurrent tests, same-store reuse, Cookie clearing and SSH cut/recovery exercise routing and storage boundaries without accessing user services.
- AC-005 [REQ-005]: Harness cleanup, focused native run, source-size check and evidence review complete; report distinguishes prototype from production readiness.

## Behavior Delta

Not applicable to production: design validation and standalone test tooling only.

## Plan and ownership

Use `scripts/macos-web-origin-probe/` exclusively. Keep each new module below 300 lines where practical and within the repository ratchet. `ssh_fixture.py` owns disposable OpenSSH processes; `origin_server.py` owns observable HTTP/WS fixtures; `gateway.py` owns test-only HTTP/SOCKS-to-SSH routing. Swift owns per-profile Cookie state, Handler loading and native checks in separate files. `websocket-map.js` owns the narrow test wrapper. Native runtime registration lives in a small Objective-C adapter. `run.py` orchestrates and asserts server-side evidence.

- [x] Build the observable HTTP/WS and SSH fixtures with fail-closed routes.
- [x] Reproduce missing Cookie behavior, then add per-store send/receive synchronization.
- [x] Exercise page and Worker sockets through SSH with per-handshake Cookie lookup.
- [x] Exercise isolation, store reuse/clear, SSH failure/recovery and raw-loopback controls.
- [x] Record negative controls, run verification and write the production feasibility decision.

## Evidence

AC-001–005 evaluated on macOS 26.5. A/B each passed 21 native checks (42 total), with six lifecycle/compatibility phase records. Real OpenSSH public-key authentication, original HTTP/WS origin, first-party Cookie synchronization, classic/module Worker WS, concurrent profile isolation, reuse/clear and SSH cut/recovery passed. Raw page and Blob Worker localhost WS reached no local sentinel. Strict CSP blocked mapped WS, so general production readiness is no-go.

- Reproducible tool and detailed decision: [probe README](../../../scripts/macos-web-origin-probe/README.md).
- Durable observed results: [evidence](../../../scripts/macos-web-origin-probe/evidence.json).
- `python3 scripts/macos-web-origin-probe/run.py`: passed, including known-blocker characterization.
- `pnpm check`: passed (1485 Vitest cases, 40 Node cases; 2 Vitest cases skipped).
- `pnpm check:source-size`: passed, no baseline changes.

No production behavior or dependency changes; no desktop package build needed. Earlier local Vite evidence is not claimed as a Vite-over-SSH or Qterm integration result. First-party-only Cookie semantics, nonpersistent test stores, unsupported runtime registration and CSP/Worker limitations remain explicit boundaries.
