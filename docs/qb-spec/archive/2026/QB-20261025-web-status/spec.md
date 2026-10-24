---
schema: 1
id: QB-20261025-web-status
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Persistent browser status and stronger scrollbars

Authorization: user requests reverting transient feedback to fixed-height persistent status, adding resource counts, strengthening scrollbar color, and assessing (not implementing) download speed.

## Behavior Delta

### MODIFIED
- REQ-001: Replace transient overlay with a persistent 24px footer outside guest bounds. No webpage overlap, dismissal timer or feedback clipping.
- REQ-002: Make browser scrollbar colors opaque and darker while preserving theme hue and stronger hover/active states; terminal colors themselves remain unchanged.

### ADDED
- REQ-003: Show loading/loaded/failed/stopped state, observed completed resource count and available page load duration. Counts are document-scoped, exclude iframe/worker internals, and do not imply successful HTTP status or a known total. Sampling must not grant guest IPC authority.
- REQ-004: Assess download-speed sources without exposing misleading speed measurements.

## Acceptance and plan

- AC-001 (REQ-001): Component/layout tests verify persistence, fixed height and sibling placement; remove unused feedback native overlay path.
- AC-002 (REQ-002): Palette tests verify opaque darker values and real WebView smoke still verifies native style injection.
- AC-003 (REQ-003): PerformanceObserver counts completed entries without retaining URLs or buffer growth; fixed native sampler validates bounded numeric output. Poller ignores stale navigation/disposal results and pauses hidden views. Native navigation supplies failure/cancellation state. Test observer, parser, lifecycle and native sampling.
- AC-004 (REQ-004): Record resource-timing limitations and native CDP/SSH alternatives in completion evidence.

Implementation owners: WebFeedback presentation; watchWebMetrics sampling lifecycle; native metrics adapter and fixed initialization script; NavigationState load-state rules. Thin IPC only; no persistence or proxy changes. Existing modules below size ceilings, new modules budget <200 lines. Source-size preflight passed. Prior authorized code retained except explicitly superseded presentation.

## Verification

- Web focused suite: 18 files / 65 tests passed, covering persistent footer placement, loading/error/stop messages, opaque palette, observation beyond 250 resources, duplicate installation, document reset, hidden sampling and stale-result cleanup.
- Rust all-target/all-feature suite with two threads: 349 passed, 7 pre-existing ignored cases. Native WebView2 smoke explicitly passed, including aggregate metric sampling, scrollbar styles, navigation/Stop and guest IPC denial.
- Rust fmt/Clippy, frontend lint, TypeScript/Vite production build, source-size (zero ratchet reminders), whitespace validation and all 21 Node tooling tests passed. Full frontend suite with two workers: 203 files passed / 1 skipped; 1232 tests passed / 2 skipped. Final disconnected-state presentation refinement additionally passed all 3 WebFeedback tests and targeted lint.
- Directory Map updated for persistent presentation and aggregate sampling ownership. No dependency/native packaging changes; no release bundle needed. No screenshot-based manual visual verification is claimed.

## Download speed assessment (AC-004)

- Resource Timing can report transfer sizes, but cached responses and cross-origin resources without Timing-Allow-Origin may report zero. A delta over time would undercount and arrive on resource completion rather than represent continuous downloading. Source: https://developer.mozilla.org/en-US/docs/Web/API/PerformanceResourceTiming/transferSize
- WebView2 supports native DevTools protocol calls/events. A future per-guest collector can aggregate Network.dataReceived encodedDataLength over a rolling interval, associate request IDs with document epochs, and treat cache, cancellation, redirects and background requests explicitly. This is the recommended path for browser-level downloaded-byte speed, not an OS network-link speed meter. Sources: https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2 and https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-dataReceived
- The per-guest SOCKS proxy is another possible byte counter, but includes transport overhead and has different semantics from content bytes. No speed UI or collection added in this change.
