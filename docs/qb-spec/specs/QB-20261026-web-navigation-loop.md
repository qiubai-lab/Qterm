---
schema: 1
id: QB-20261026-web-navigation-loop
type: bugfix
tier: standard
status: active
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Stop runaway macOS webpage navigation

User report: Baidu search alternates addresses while remaining white, including security-verification URLs. The previous homepage redirect probe passed; a fresh-store search probe with production scripts reaches a stable security-verification page. The user's repeated loop is not yet reproduced against Baidu itself. Do not claim that the website's verification compatibility or the exact trigger has been fixed.

## Behavior Delta
### ADDED
- REQ-001: Stop rapid repeated main-frame document navigation with a visible explanation, without replaying requests, weakening TLS, changing User-Agent, bypassing verification, or clearing user data. Explicit toolbar navigation/reload/back/forward or data clearing starts a new attempt.
### MODIFIED
- REQ-002: Report native load failures with an error code/message instead of an unexplained generic failure; provisional URL updates must not be recorded as completed history visits.

## Acceptance
- AC-001 [REQ-001]: Real WKWebView fixture still follows ordinary 301/302 redirects, stops a two-page JavaScript loop with changing query tokens, preserves its failure against cancellation callbacks, and recovers on explicit navigation. A pure guard check covers separate visits, reset and the latched stop.
- AC-002 [REQ-002]: A slow provisional navigation produces no visited history event. Native failures emit nonempty error details; existing frontend error rendering and browser tests remain green.

## Implementation

A dedicated `NavigationGuard.swift` owns a bounded window of main-frame destinations, ignoring query/fragment for loop counting. The seventh visit to the same scheme/host/port/path within ten seconds stops the chain; at most 64 destinations are retained. Explicit application navigation and data clearing reset the latch. `Guest.swift` owns delegate integration, failure presentation and visited-event gating. Shared IPC and storage schemas remain unchanged. No baseline growth or new dependency.

## Verification

- AC-001: `python3 scripts/macos-web-smoke/fixture.py --navigation-only` passed with real WebKit on macOS 26.6.2: 301/302, query-token script loop, latched failure, explicit navigation and data-clear recovery. Production-adapter probes against Baidu homepage/search with and without injected scripts reach a stable verification page; they do not reproduce the user's white-screen loop.
- AC-002: The same fixture passed native error-code/message and no-provisional-visit checks. Focused `useWebBrowser` / `WebFeedback` tests passed (13); Rust web tests passed (39), `cargo build` and `cargo fmt --check` passed. Source-size check has zero reminders; no persistence schema or network policy changes.
- Full native fixture reruns failed at synthetic popup clicks (POST/about:blank/initial-click delivery). A temporary click-delivery diagnostic confirmed an undelivered click; it was removed rather than weakening assertions. Full mouse-interaction coverage is not reported as passed for this change. The focused mode excludes those tests explicitly.
- Original report remains open: these are navigation-loop mitigation, error reporting and history corrections. The precise Baidu white-screen trigger and successful search in the user's persistent browsing environment remain unverified. Keep this change active until that reproduction is resolved; do not label the site compatibility fixed.
