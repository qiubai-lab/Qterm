---
schema: 1
id: QB-20261025-web-scrollbar-recovery
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Preserve native webpage scrollbar styling across dynamic updates

Authorization: user requested implementation after analysis of dynamic content showing default scrollbars until refresh. Existing script loses styling when its DOM style node/head is removed and has no document-lifetime recovery; the exact mutation on the user's Baidu page was not captured. Preserve unrelated workspace/tab drag changes already in this checkout.

## Behavior Delta
### MODIFIED
- REQ-001: Dynamic content and ordinary head/root/style replacement retain the existing 3px native scrollbar design and latest palette without refresh or scroll-position reset.
- REQ-002: Repeated host theme synchronization reuses one document-local owner; observation remains scoped, repairs are coalesced, and page suspension/restoration does not leak work or stale palette. Guest IPC, network routing, native scroll input and accessibility colors remain unchanged.

## Acceptance
- AC-001 [REQ-001]: DOM regressions first fail with the existing script, then pass for style removal/text edits/head/root replacement and latest-palette restoration. Real WebView2 verifies overflow appears after loading, actual scrollbar gutter/pseudo styles, nested scrollers, and retained scroll position/document state.
- AC-002 [REQ-002]: Tests cover idempotent synchronization, no writes for ordinary body content growth, suspension/resume, bootstrap before HTML, and no stale default observer after theme updates. Native smoke still covers local/remote/guest restrictions and popup flow.

## Plan and ownership
- [x] Add failing document-lifecycle regressions adjacent to web scrollbar tests.
- [x] Extend the existing guest presentation script with a single document-scoped controller. Keep Rust numeric-palette IPC and existing appearance unchanged; no broad frontend state or dependencies.
- [x] Add native dynamic-overflow/replacement evidence and attempt an opt-in Baidu search transition in the isolated native guest.
- [x] Run focused/full checks, update behavior/module documentation and archive evidence.

Embedded review: bounded repair of owned presentation state, no security/persistence contract change. No subtree observation of ordinary body content and no polling or forced overflow toggles. Growth budget: script under 160 lines, new cohesive DOM and native test modules under source limits. Reuse existing skills/context and native smoke fixtures; no separate agent required.

## Verification
- VER-001 [AC-001, AC-002]: Four new DOM regressions failed on the old implementation; all five focused tests now pass. Real WebView2 confirms dynamic viewport/nested 3px gutters, retained palette and scroll position after style/head changes without host synchronization or reload. The final complete native smoke passed in 38.13 seconds.
- VER-002 [AC-001, AC-002]: Full bounded frontend rerun passed 1363 tests, plus 21 Node script tests and TypeScript/Vite build. Rust all-target/all-feature tests passed 361 tests; formatting and Clippy passed. Source-size and whitespace checks passed. Initial default-concurrency frontend failures and skip counts are documented in the evidence.
- Supplemental live-site limitation: the Baidu search transition did not complete under automation, and the final attempt did not meet readiness within 45 seconds. Controlled native behavior is verified; the original Baidu interaction and its exact DOM mutation remain unverified.

Evidence: `docs/qb-spec/evidence/QB-20261025-web-scrollbar-recovery/README.md`.
