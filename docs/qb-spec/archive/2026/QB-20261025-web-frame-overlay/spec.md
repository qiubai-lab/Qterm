---
schema: 1
id: QB-20261025-web-frame-overlay
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Remove black trails from the moving Web Block frame

Authorization: after the analysis identified moving native-region holes as the cause, the user explicitly requests a fix.

- REQ-001: Moving the active frame must never remove webpage pixels or expose dark canvas stripes, including rapid reversal and rounded corners.
- REQ-002: Preserve theme border color, opacity, shape, existing motion and native page mouse/keyboard focus. The overlay cannot receive input or grant guest IPC permissions.
- REQ-003: Native overlay ownership must follow guest visibility/close and stay bounded across frame updates; retain tooltip behavior and avoid repeatedly resizing/showing the browser during animation.
- AC-001 [REQ-001]: Frame geometry produces no region holes; raster tests cover forward/reverse sequences at 100/125/150/200% and prove transparent interiors/old positions. Native animation asserts the guest stays unclipped throughout.
- AC-002 [REQ-002]: Computed theme properties reach a premultiplied alpha border; native layered window is transparent to input and never activates. Real bright-background WebView2 animation and input are inspected.
- AC-003 [REQ-003]: Native overlay hides without a frame and is destroyed with its guest; GDI allocations are released after updates. Native focus/tooltip/security regressions and repository checks pass.

## Behavior Delta

### MODIFIED
- REQ-001: Replace moving-frame HWND holes with a per-pixel alpha native child overlay. Tooltip-only occlusions remain.
- REQ-002: Mirror the existing sampled CSS border rather than repainting or reloading page content.
- REQ-003: Browser bounds/visibility updates occur only on geometry/DPI/visibility changes, independently of border frames.

## Plan and verification

- [x] Separate frame presentation from tooltip occlusions; add source/geometry/theme regression tests.
- [x] Add bounded pure border rasterization and a mouse-transparent native overlay with parent-owned lifetime.
- [x] Verify continuous native forward/reverse animation on bright pages, input, region integrity and cleanup; run repository gates and Windows packaging.

Ownership: webSurfaceFrame samples UI presentation; frame_raster validates/rasterizes only border pixels; windows_frame owns HWND/GDI interaction; windows_surface retains focus and tooltip clipping; WebHost owns browser lifetime and geometry caching. No persisted schema, authentication or guest authority changes. Existing LayoutView hotspot does not grow. Standard embedded review passed: the new presentation path removes the destructive operation that caused black trails; verification explicitly exercises motion rather than relying on a static frame screenshot. Existing UI/module skills and style context apply; no new global preference.

## Verification evidence

- VER-001 [AC-001, AC-002]: `pnpm check` passed: 192 frontend test files, 1182 tests (1 file / 2 tests intentionally skipped), 21 Node script tests, ESLint, TypeScript and Vite production build. Focused Web Block suite passed 19 tests. Frame sampling covers theme colors, opacity and forward/reverse geometry; frame occlusion regression proves no webpage cutouts.
- VER-002 [AC-001, AC-003]: `cargo test --all-targets --all-features` passed 337 tests with 7 environment-dependent tests ignored. Raster regression covers 100/125/150/200% scales, repeated direction changes, transparent interiors/old positions, premultiplied color and rounded corners. `cargo fmt --check`, strict all-target/all-feature Clippy and source-size ratchet (0 reminders) passed.
- VER-003 [AC-001, AC-002, AC-003]: Explicit Windows `native_webview_smoke` passed after the final cleanup assertions: continuous forward/reverse samples retain an unclipped guest; focus events, tooltip-only clipping, overlay show/hide, input-transparent/nonactivating styles and child destruction on both guest closures pass. Existing separate proxy, native bounds/visibility and denied guest IPC/navigation assertions also pass.
- VER-004 [AC-002]: Inspected a 90-second native WebView2 animation on bright local fixture pages and typed into the right guest during movement. No dark trails appeared. Evidence: [bright frame](../../../evidence/QB-20261025-web-frame-overlay/bright-frame.png), [moving frame and native input](../../../evidence/QB-20261025-web-frame-overlay/animation-input.png). These are isolated native fixtures, not an end-to-end login to the user's remote site.

Windows compatibility: the existing linker-embedded Common Controls manifest is preserved, with an additional supportedOS manifest input shared by application and native tests. Without that compatibility declaration Windows rejected layered child creation; real native tests pass with it. No new native dependency or IPC permission was added for the overlay.

- VER-005 [AC-003]: pnpm tauri build passed; rebuilt NSIS and MSI Windows x64 bundles at src-tauri/target/release/bundle/. No installer was run against the existing user installation. git diff --check passed.
