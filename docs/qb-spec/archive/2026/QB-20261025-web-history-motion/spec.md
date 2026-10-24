---
schema: 1
id: QB-20261025-web-history-motion
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Animated history reveal with matching native corners

Authorization: add history dropdown opening/closing motion and remove black corner pixels.

- REQ-001: Reveal the recent-history panel from its address anchor and retract on dismissal, retaining exit paint but immediately disabling interaction. Reopening interrupts dismissal; reduced motion removes animation.
- REQ-002: The native cutout follows the visible rounded panel, leaving webpage pixels intact outside the shape, including fractional DPI.
- AC-001 [REQ-001]: Adjacent behavior tests cover retained exit, disabled exit actions, rapid reopen, hidden workspace cleanup and reduced motion; actual Windows app validates open/close.
- AC-002 [REQ-002]: Geometry tests emulate native floor/ceil at 1, 1.25, 1.5, 2, 3 and 4 DPI, verify corners, continuous interior bands and partial/full reveal. Inspect actual native screenshot.
- AC-003 [REQ-001, REQ-002]: Run focused frontend tests and repository check; report exact failures and rerun only affected gates.

## Behavior Delta

### MODIFIED
- REQ-001: WebAddressHistory owns retained presentation lifetime, WebAddressBar owns open intent; existing IPC, navigation, persistence and selection contracts stay unchanged.
- REQ-002: webSurfaceOcclusion samples the CSS reveal and generates bounded pixel-aligned bands inside the opaque rounded shape. No native or IPC changes.

## Design and plan

- Use a 160 ms reveal and 120 ms retract. A local clip-path transition deliberately replaces transform/opacity: it preserves text size, avoids layout shifts and avoids blending the panel with the black native host. Existing rAF surface synchronization samples the same visible edge. Remove the shadow outside the clipped panel.
- Growth budget: add at most 25 lines to the presentation lifecycle, 60 to the geometry owner and focused tests; existing files are not size-baselined. No new dependency or stable module boundary.
- [x] Implement opaque reveal, interruption and rounded native bands.
- [x] Verify automated and actual Windows behavior, then archive evidence.

## Evidence

- Preflight source-size gate passed with zero ratchet reminders. Existing Qterm UI/module rules apply. This is a local motion correction, not a new cross-task preference or ownership boundary requiring context/Directory Map updates.

- AC-001: Retained exit surface, disabled exit actions, interruption/reopen, immediate reduced-motion dismissal and hidden-workspace disposal passed in WebAddressHistory tests. Style assertions protect 160/120 ms reveal timing, reduced motion and opaque, unscaled content. Native app was refreshed to load current frontend resources, then restored to its original localhost sign-in URL without entering credentials or changing remote data. Actual open/close was exercised; final open and closed screenshots confirm the resulting surfaces. This is endpoint visual evidence, not a high-speed recording of every animation frame.
- AC-002: All 11 webSurfaceOcclusion tests passed in the full suite, including six DPI values with native floor/ceil emulation, rounded corners, continuous interior bands, partial/full reveal, out-of-guest and subpixel regions. Actual Qterm Dev WebView2 screenshot shows no black rectangular corner cutouts; the page remains visible around the rounded panel. Evidence: `docs/qb-spec/evidence/QB-20261025-web-history-motion/history-open-native.png` and `history-closed-native.png`.
- AC-003: First check found a synchronous state update in the reduced-motion effect; changed it to render-derived state and reran the check. Final `pnpm check` passed source-size (zero reminders) and ESLint. Full Vitest: 196 files / 1211 tests passed, 1 file / 2 tests skipped; 3 unrelated existing tests timed out at 5 seconds (two workspaceTabDeck cases and one GitPane.submodules case), so that command exited nonzero. Scoped rerun `pnpm exec vitest run src/app/workspaceTabDeck.test.tsx src/git/GitPane.submodules.test.tsx --maxWorkers=2` passed both files / all 10 tests with unchanged timeouts. Remaining check stages ran separately: 21 Node script tests passed; `pnpm build` passed TypeScript and Vite (existing large-chunk advisory). No native backend/configuration/dependency changes, so no Rust or installer rebuild needed.
- Final whitespace check passed. No new cross-task preference, module boundary, dependency or persistent data contract was introduced.
