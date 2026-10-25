# Browser tab recovery and overlay scrolling

Windows WebView2, 2026-10-25. Implements the user's confirmed cache lifecycle and zero-gutter 3→9px overlay design. Existing unrelated layout/drag changes are preserved.

## Behavior and ownership

- `cache/web-tabs/sessions.json` stores independent block IDs with connection identity, ordered tab IDs/HTTP(S) addresses/titles and the selected tab. Normal exit/remount retains the snapshot; explicit block/workspace deletion prunes it. Connection changes discard mismatched records. Site data remains independent.
- Workspace and tab writes share an ordered queue and normal-close flush. Cache hydration precedes mounting browser blocks; failed/future reads are reported and never overwritten. Each JSON replacement is atomic, and startup reconciles tab records against the surviving workspace layout. Changes use a 180ms debounce; forced termination may lose changes that have not yet been committed.
- Restored background tabs are not allocated native guests until selected/visible. Popup request tokens, POST bodies, form data and navigation stacks are not restored.
- A shadow-scoped guest overlay hides native bars only on enhanced document/nested scrollers. It has a 3px thumb, a 9px proximity appearance and a 12px thumb hit target; no cursor warping or page-width change. Wheel/content scrolling remains native; pointer capture, keyboard controls and release/cancel/blur have explicit owners. Theme/style/host repair survives dynamic page changes.

## Native evidence

These are captures of an isolated production WebView2 guest, not the full workbench or the user's existing browser profile:

- [Dynamic horizontal/vertical and nested overflow](dynamic-overflow.png)
- [After style/head replacement](recovered-head.png)
- [9px hover appearance](scrollbar-hover.png)
- [After dragging](scrollbar-after-drag.png)

The native smoke asserts zero viewport and nested gutters, current theme, style/head/host recovery without reload, and retained document/scroll position. Trusted CDP mouse events start seven pixels inward (outside the resting 3px thumb), then move away from the rail while held. Both root and nested axes must scroll, retain capture, preserve viewport dimensions, return to 3px on release, and release capture on cancel/blur. The fixture uses native input with the left button held during moves; the first attempt incorrectly used `button: none`, which dropped capture in the driver. Corrected input passed all four drag scenarios and existing popup/proxy/IPC checks.

## Automated checks

- Cache adapter/service tests reconstruct the repository after saving, preserve independent blocks/selection/order, remove deleted records, reject invalid schemes/credentials/IDs/selection/tab limits, and preserve corrupt/future files.
- Session-store and persistence tests cover pre-hydration safety, remount, same-target block isolation, stale callbacks, retargeting, block deletion, ordered pending-save/close flush and read failures.
- Tab rendering tests check lazy native page mounting, saved selection/order, remount and initial empty metadata without URL loss. Overlay DOM tests cover dynamic nested discovery/removal, observers, capture/cancel/blur and theme resumption, alongside earlier stylesheet lifecycle regressions.
- `VITEST_MAX_WORKERS=2 pnpm check` passed: source-size (zero reminders), ESLint, **236 files / 1375 frontend tests** (1 file / 2 tests skipped), **21 Node script tests**, TypeScript and Vite build. The worker bound uses Vitest's supported environment setting; no assertions/timeouts were weakened. Existing Vite bundle-size warnings remain.
- After the full check, title normalization was tightened to remove C1 control characters consistently with Rust validation. The affected store/overlay files passed all **6 focused tests**, ESLint and type checking; production build was repeated after removing compiler-generated verification artifacts.
- Final native smoke passed in **39.88 seconds**, including the extra actual-overlay palette and host-removal assertions, all four trusted-pointer drag cases, and existing popup/network/guest restrictions. Captures were visually inspected at rest, hover and after release.
- Rust `--all-targets --all-features` passed **364 tests**, with 7 ignored, in **109.84 seconds**. Formatting and Clippy with `-D warnings` passed. The final production frontend rebuild also passed after cleanup; whitespace/source-size checks remain clean.

## Reproduction

```powershell
$env:VITEST_MAX_WORKERS='2'
pnpm check
cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- --test-threads=2
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml native_webview_smoke -- --ignored --nocapture --test-threads=1
```

No dependency/capability/schema migration, release bundle, commit or push. Rebuild/restart the desktop binary to load embedded guest scripts. Existing native profile/cookie behavior is unchanged. Cross-origin iframes, closed shadow roots and website-drawn scrollbars are outside the document enhancement scope; public Baidu search interaction is not claimed as verified by this deterministic fixture.

## Follow-up: hover exit grace period (2026-10-25)

User requested more tolerance for fast mouse movement after proximity expansion. This small follow-up changes only the interaction owner: keep the expanded scrollbar for 600ms after leaving, cancel collapse on return, and do not postpone it indefinitely on repeated moves outside. Starting a drag cancels the timer; release/cancel/blur, removal and page suspension still clean up immediately.

Four new assertions failed with immediate collapse before the change. All 13 scrollbar interaction/overlay/lifecycle/theme tests now pass, including both axes, re-entry, continued outside movement and timer disposal. ESLint, type checking, JavaScript syntax, whitespace and source-size checks pass. Native pointer verification now checks the retained 9px appearance after leaving, re-entry beyond the original deadline, and eventual return to 3px before exercising the existing four drag scenarios.

Final native smoke passed in **40.98 seconds**, including the new grace-period checks and all four trusted-pointer drags. The short retention sample runs inside the guest to avoid host polling latency consuming its measurement window. One intervening run failed the existing nested-horizontal pointer-capture assertion; the unchanged rerun passed, so native input verification still has an intermittent capture limitation. Rust formatting and Clippy with `-D warnings` pass; no release bundle was produced.
