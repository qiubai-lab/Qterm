---
schema: 1
id: QB-20261026-web-viewport-scrollbars
type: bugfix
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Viewport-only guest scrollbars

Authorization: user accepted the scrollbar repair, then explicitly restricted rendering to overall page height/width; internal styles must remain untouched.

## Scope and acceptance

- REQ-001: Enhance only the document scrolling element's two viewport axes. Do not register, mark, style, or intercept nested containers, frames, or shadow content.
- REQ-002: Respect the page's root scrollbar hiding/overflow policy; do not render bars for an invisible root. Retain real small scroll ranges rather than changing page layout or arbitrary overflow thresholds.
- REQ-003: Viewport bars fade when idle, appear during document scrolling or edge approach, and remain usable with keyboard focus and pointer capture. Suspension/removal cancels timers.
- AC-001 [REQ-001]: Dynamic nested scrollers receive no Qterm attributes or overlay bars and retain their own scrollbar styles and scrolling. Viewport overflow creates at most two bars.
- AC-002 [REQ-002]: Root scrollbar-width:none, WebKit pseudo-element hiding, overflow:hidden/clip, and visibility changes suppress the appropriate bars; restoration works without reload or host calls.
- AC-003 [REQ-003]: Scroll/edge/focus reveal, idle fade, horizontal/vertical dragging, keyboard behavior, cleanup and existing stylesheet recovery pass automated checks; native WebKit confirms styling isolation and lifecycle.

## Behavior Delta

### MODIFIED

- REQ-001: Previously all nested auto/scroll containers received themed overlays; only the overall webpage now receives them.
- REQ-002: Previously authored hiding could be overridden; root authored policy is sampled separately from Qterm's own native-bar suppression.
- REQ-003: Previously overflow bars remained painted while idle; they now reveal transiently while keeping keyboard access.

## Implementation

Owner: `scrollbar_overlay.mjs` controls viewport lifecycle, `scrollbar_geometry.mjs` computes dimensions, a small `scrollbar_visibility.mjs` reads authored root policy, `scrollbar_interaction.mjs` owns reveal/input timers, and scoped CSS paints the overlay. Rust stays a script composition façade. No IPC, storage, network or ATS changes. Existing files remain below their size limits; budget: new policy <80 lines, overlay <150, interaction <180.

- Add regression tests for nested isolation, root authored styles and timed reveal before implementing.
- Remove nested discovery and global selectors; retain dynamic document metrics and style recovery.
- Run focused tests, native WKWebView probe, `pnpm check`, Rust script composition test and formatting checks; update Directory Map for the policy owner.

Embedded review: PASS; authorization and acceptance match the final viewport-only scope. Original DingTalk DOM remains uninspected, so controlled regression evidence must not be reported as live DingTalk verification.

## Verification

- AC-001: The new nested-isolation regression failed against the old installer, then passed. A native WKWebView fixture using the production script composition rendered exactly two viewport axes; its nested container retained 11px red native scrollbar styling and received no Qterm attribute. Nested scrolling did not reveal the outer overlay. See `docs/qb-spec/evidence/QB-20261026-web-viewport-scrollbars/viewport-idle.png` (visually inspected).
- AC-002: Policy unit tests and native WKWebView passed dynamic root scrollbar-width:none, pseudo-element display:none, root visibility:hidden, body-propagated overflow:hidden, restoration without reload and one-axis overflow. The owned stylesheet is temporarily disabled during authored-policy reads and restored synchronously; internal page styles are never rewritten.
- AC-003: All 17 focused tests passed, covering edge dwell, drag/cancel, focus, scroll idle timers, suspension, visibility and stylesheet recovery. Native WKWebView additionally passed scroll reveal/fade, focus persistence, keyboard End and pagehide/pageshow recovery. Existing Windows native tests were updated to assert viewport-only bars and untouched nested styles, but Windows trusted-pointer execution is unavailable on this macOS host.
- `pnpm check` passed: 240 Vitest files / 1396 tests, 27 Node tests, ESLint, TypeScript, Vite build and source-size checks. The final geometry simplification was also covered by a subsequent focused rerun and the native probe. `cargo test --manifest-path src-tauri/Cargo.toml infrastructure::web::scrollbars::tests --lib` passed. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` passed. Rust formatting and final diff whitespace checks passed after formatting the changed Windows test.
- Source ownership and Directory Map updated; no new dependencies, application permissions, persistence schemas, network policy or packaging changes. No release bundle needed.

The original DingTalk session was not inspected or used for validation. Native evidence comes from an isolated local page, with the current embedded scripts; no login or user data was accessed. Rebuild/restart the desktop process to load changed embedded scripts, then reopen the page.
