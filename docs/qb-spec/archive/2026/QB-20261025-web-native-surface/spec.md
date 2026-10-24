---
schema: 1
id: QB-20261025-web-native-surface
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Native Web Block interaction and stacking

Authorization: user requests fixing tooltip blackouts, webpage clicks failing to activate their block, and native content obscuring the moving active frame.

- REQ-001: Hovering toolbar buttons must leave the webpage visible; overlapping tooltips occupy only their own footprint.
- REQ-002: Native webpage focus activates its owning block without stealing focus from the page or granting it application IPC authority.
- REQ-003: The moving active frame stays visible over native webpage content throughout its existing animation; restore unclipped content afterward.
- AC-001 [REQ-001]: Tooltip visibility and overlap geometry tests pass; real Windows child rendering remains visible around an overlay.
- AC-002 [REQ-002]: Native focus event is delivered; frontend filters unrelated/stale/hidden guests, selects its block and preserves native focus; existing IPC rejection test passes.
- AC-003 [REQ-003]: Animated DOM rectangles produce edge-only clipping, Windows child window regions expose those edges at DPI scale, and removing occlusions restores the full guest.

## Behavior Delta

### MODIFIED
- REQ-001: Tooltip appearance no longer hides all guest windows. Dialog/menu/lock/inactive-workspace hiding remains intact.
- REQ-002: Content focus now reaches the workspace selection owner through a native event.
- REQ-003: Windowed WebView2 receives bounded local clipping rectangles sampled from the existing animated frame.

## Implementation and verification

- [x] Add local occlusion geometry and focused regression tests; keep LayoutView unchanged at its baseline.
- [x] Add Windows focus/region adapter; validate transport bounds and preserve proxy, origin, IPC and lifecycle boundaries.
- [x] Run frontend checks, Rust checks, native smoke including focus/region restoration, and native build because Windows dependencies change.

Ownership: webSurfaceOcclusion derives UI overlap; useWebBrowser owns guest listener/bounds lifecycle; workspace retains selection authority; windows_surface owns HWND focus and clipping. No workspace schema or SSH authentication changes. New modules remain below source-size limits. Standard embedded review: scope and acceptance directly cover the reported regressions; native tests supplement DOM tests because CSS cannot validate HWND airspace.

## Verification evidence

- AC-001 / AC-003: `webSurfaceOcclusion.test.ts` verifies overlapping and unrelated tooltips, sampled moving edges, rounded corners, intact interiors and restoration. `webSurfaceVisible` no longer treats tooltips as full-surface blockers; dialog/menu/lock/inactive workspace behavior remains tested.
- AC-002: `useWebBrowser.test.tsx` filters stale, unrelated and hidden guest focus and cleans listeners. `WebBlock.test.tsx` verifies native focus dispatches the owning workspace/block selection. `workspaceWebFocus.test.ts` verifies the shell does not steal focus from a native guest while still restoring it from main-document tab interaction.
- AC-001 / AC-002 / AC-003: real Windows `native_webview_smoke` passed. New native assertions cover guest focus delivery to main, actual HWND region holes for a tooltip and an intermediate frame, visible content interior, and removal/restoration. Existing remote loopback/proxy isolation, guest IPC denial and privileged navigation rejection passed. Screenshot: `docs/qb-spec/evidence/QB-20261025-web-native-surface/native-overlays.png` (real isolated WebView2 fixture, not a live user SSH page). Uses the display's actual DPI; other monitor scales were not manually exercised.
- Native test first attempt subscribed at App scope to a main-only event and timed out; corrected the test to subscribe on main. The succeeding native run passed. Idle SOCKS preconnections timed out during the screenshot hold without failing assertions.
- `pnpm check`: source-size and repository ESLint passed; default-concurrency Vitest hit nine 5-second timeouts in unrelated existing workspaces/dialog/Git tests. No assertions or timeouts were changed. `pnpm exec vitest run --maxWorkers=2`: 191 files / 1180 tests passed, 1 file / 2 tests skipped. Final rounded-corner and focus-wiring additions: focused 7 files / 18 tests passed. Final affected ESLint passed; 21 repository Node script tests passed. Source-size: 0 reminders.
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` passed. `cargo test --all-targets --all-features`: 333 passed, 7 ignored (interactive native smoke explicitly run separately).
- Production frontend typecheck/Vite build passed as part of the native package build, with the existing large-chunk warning.
- `pnpm tauri build` passed; rebuilt `src-tauri/target/release/bundle/nsis/Qterm_0.5.7_x64-setup.exe` and `src-tauri/target/release/bundle/msi/Qterm_0.5.7_x64_en-US.msi`. No installer was run and the installed application was not replaced.
- Actual development window was inspected; automated navigation stopped on desktop input/geometry conflicts. The user page is not counted as an end-to-end acceptance run. Native fixture evidence and focused frontend integration tests cover the repair; continuous animation timing across different machines remains a manual visual check.
- Directory Map updated for native surface ownership. No new global style preference; existing terminal frame/animation and theme tokens are preserved.
