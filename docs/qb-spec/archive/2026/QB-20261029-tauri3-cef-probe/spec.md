---
schema: 1
id: QB-20261029-tauri3-cef-probe
type: design
tier: standard
status: archived
created: 2026-10-29
updated: 2026-10-29
supersedes: []
---

# Independent macOS Tauri 3 + CEF validation build

Authorization: user selected the researched CEF design, requested a real new Git branch, independent macOS build, reused OpenSSH tests and measured bundle/memory costs. Branch `codex/tauri3-cef-probe`, isolated checkout. No production dependency, configuration or behavior changes.

## Requirements and acceptance

- REQ-001 / AC-001: Pin published Tauri 3/CEF alpha versions in an independent package and lockfiles. Build an ad-hoc signed macOS `.app` and compressed DMG with a distinct identity. Record actual byte sizes, architecture and build versions. Do not describe prototype measurements as full-Qterm migration deltas.
- REQ-002 / AC-002: Reuse disposable pinned-host-key OpenSSH fixtures. Two independently authenticated routes serve the same browser URL `http://localhost:3000`; assert HTTP Host/Origin/POST and the actual destination.
- REQ-003 / AC-003: Native Cookie semantics, page/classic/module/blob Worker WebSocket, strict CSP and per-environment storage must be tested without URL rewriting, Cookie rewriting or network API injection. Assert disconnection does not reach a local sentinel, B survives A failure, and recovery works.
- REQ-004 / AC-004: Measure process-tree RSS for idle, one page, two independent environments, and closed pages using the release `.app`. Record sampling duration, min/median/max and included processes; clearly distinguish RSS from physical footprint and no claim of full application overhead.
- REQ-005 / AC-005: Deliver commands, machine-readable evidence, limitations and a runnable reviewable artifact. Preserve original `dev` and user data. Cleanup test processes/keys and keep needed artifacts in the isolated checkout or build cache.

## Approved architecture and ownership

Independent `experiments/tauri3-cef-probe/` owns its Cargo/npm graph, trusted stdin control, disposable guest contexts and static probe UI. Rust modules own process bootstrap, browser creation, complete per-context proxy configuration and test-result reporting. Python owns SSH lifecycle, SOCKS transport-only fixture routing and external RSS sampling. Guest pages receive no application commands; diagnostic console results are test evidence only. All new code modules target <300 lines and remain within the repository ratchet.

Use public CEF RequestContext preferences with complete fixed proxy + `<-loopback>`, validate success before first navigation, never add DIRECT fallback. Fresh test profiles eliminate persisted-worker startup ambiguity. Sandbox Required; temporary application data. Two simulated remote services share one OS namespace on distinct fixture ports; document this boundary.

## Plan / checks

- [x] Create named Git branch in a separate managed checkout and copy earlier uncommitted fixture without altering its source.
- [x] Pin and build minimal release application; isolate build tools and caches.
- [x] Implement public CEF proxy configuration and native result reporting; run real SSH matrix.
- [x] Package `.app` and DMG; run release process-tree memory samples and collect byte sizes.
- [x] Run focused tests/fmt/source-size checks, inspect artifacts, and report measured results plus limitations.

Source-size baseline passed at checkout creation. Previous repository checks on the same base passed; only standalone experimental surfaces are being added. Evidence: `experiments/tauri3-cef-probe/evidence/{results,verification,interruption}.json`; reproducible commands and measured tables in the experiment README. Final native matrix: 63/63; real public-key-authenticated SSH for A/B, zero IPv4/IPv6 sentinel hits. `.app` 350,480,436 bytes; DMG 148,199,600 bytes. Footprint medians: idle 212.8 MiB, one SSH page 252.1 MiB, two SSH pages 294.5 MiB, closed pages 208.8 MiB. These are prototype measurements, not production migration deltas.

## Findings and production gate

The experiment meets its validation/delivery requirements, not a production-readiness gate. alpha.6 reapplies global preferences when opening another same-profile context. A process-owned rejecting SOCKS default prevents leakage, but active A requests transiently fail (12/31 in the final race probe). Qterm integration must fix RequestContext initialization/reuse before shipping. The runtime also asynchronously posts its initial URL; waiting for the requested initial `about:blank` completion avoids overwriting the subsequent localhost navigation. Both behaviours were found in real native execution, documented and covered in the final matrix.

Native Cookie (including Secure localhost and HttpOnly), page/classic/module/blob WebSocket, strict CSP, Service Worker, Cache Storage, IndexedDB and localStorage isolation pass. Independent logout, cut/recovery, abnormal existing socket close and same-profile restoration pass. Full data deletion, cross-process profile persistence, pre-existing workers at startup, actual remote servers/frameworks, long-duration memory, production Keychain/signing and Windows/Linux are outside this macOS prototype.

Review fixed the shared-profile DIRECT gap, interrupted-run false success and missing IPv6 sentinel. `cargo fmt`, release/all-target Clippy with warnings denied, Python compilation, JS parse checks and source-size ratchet pass. Package signatures and DMG checksum verified; test interruption reports failure and cleans app/SSH/sshd. No production source, dependency/config file, or original `dev` worktree was modified.


## Behavior Delta

Not applicable to production behavior: this design adds an isolated validation tool and measurements; Qterm production code and dependency graph remain unchanged.

## Acceptance evidence

| Acceptance | Evidence |
|---|---|
| AC-001 / REQ-001 | Independent pnpm/Cargo lockfiles; actual release build; evidence/results.json package bytes, architecture and hashes; verification.json signature, DMG checksum and read-only mounted binary comparison. |
| AC-002 / REQ-002 | results.json SSH public-key logs and A/B original Host/Origin/POST checks. |
| AC-003 / REQ-003 | 63 native checks, request/route logs, independent storage/worker results, cut/recovery and zero IPv4/IPv6 sentinel hits; transient same-profile failures are an explicit production gate. |
| AC-004 / REQ-004 | Four stages with 10 process-tree RSS and footprint samples each; raw process sets/output, min/median/max in results.json. |
| AC-005 / REQ-005 | README commands and limitations; preserved original dev checkout; release DMG; interruption.json confirms failed interrupted result and no leftover test processes. |
