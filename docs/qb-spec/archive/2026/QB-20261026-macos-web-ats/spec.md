---
schema: 1
id: QB-20261026-macos-web-ats
type: bugfix
tier: strict
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# macOS WebView HTTP compatibility

User authorization: “请你你先按方案1修复” approves the WebView-only ATS exception for development and production.

## Problem and scope

Bare domains currently normalize to HTTP. macOS WKWebView rejects these loads with ATS error -1022 before a server redirect can be followed. Both inspected app bundles lack ATS exceptions. Edge's HSTS internal 307 is not a server response.

This change enables the approved WebView ATS exception only. It does not introduce HTTPS-first navigation, global ATS exemptions, certificate trust overrides, proxy failover, or URL policy changes. The exception applies to all app WebViews, including the shell; URLSession retains its default ATS policy. Revert the plist/config additions and rebuild to restore the previous policy.

## Requirements

- REQ-001: Development and production macOS app WebViews may load HTTP and follow ordinary server redirects without ATS -1022 rejection.
- REQ-002: Non-WebView ATS protection and default certificate trust handling remain intact; URL normalization and SSH proxy isolation remain unchanged.

## Acceptance

- AC-001 [REQ-001]: Both flavor plist inputs and generated app bundle plists enable NSAllowsArbitraryLoadsInWebContent. A native WKWebView probe demonstrates HTTP loading and following a 307 under the new policy, compared with -1022 under the prior policy.
- AC-002 [REQ-002]: Neither flavor enables global arbitrary loads or domain exceptions; native verification rejects an untrusted HTTPS certificate and URLSession HTTP remains ATS-blocked. No navigation or proxy code changes.

## Behavior Delta

### MODIFIED

- REQ-001: HTTP WebView loads previously blocked by macOS ATS can reach the server, including redirect responses. HTTPS upgrade still depends on the server or WebKit's own HSTS state.

## Spec review

PASS: scope is the explicitly approved exception, including its app-wide WebView reach. Acceptance covers both packaging paths, prior failure, redirect behavior, and adjacent security behavior. No new product decision is required.
