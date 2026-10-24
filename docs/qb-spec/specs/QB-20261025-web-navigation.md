---
schema: 1
id: QB-20261025-web-navigation
type: bugfix
tier: standard
status: active
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Browser address focus, route synchronization and load controls

Authorization: user requests first-click address focus, route synchronization, Enter navigation without an open button, loading animation and a stop control that preserves the page.

- REQ-001: Selecting a browser block by clicking its address input preserves that input's focus after delayed workspace activation.
- REQ-002: Reflect native committed source changes including pushState/replaceState/hash and back/forward; preserve an actively edited address until submit, Escape or blur. Ignore stale completion events from superseded navigations/closed guests.
- REQ-003: Enter navigates, IME composition does not submit, and the separate open button is removed. Loading has a fixed-size animated indicator before the input and replaces refresh with Stop; stopping keeps the guest/SSH session and visible document alive.
- REQ-004: Native navigation remains the source of truth without granting guest IPC; successful commits/routes update history, canceled/failed loads do not create false visits. Preserve independent profiles, bookmark behavior, proxy policy and frame rendering.
- AC-001 [REQ-001]: Focus regression simulates a delayed selection callback after input focus and verifies typed content remains in the input; native guest-focus protection remains green.
- AC-002 [REQ-002, REQ-004]: Real Windows guest test exercises same-document routes, back/forward and successful/aborted navigation; native state filters obsolete navigation IDs. Frontend tests cover late events and draft/live URL separation.
- AC-003 [REQ-003]: Enter submit and IME guard work without an open button; pending/finished/error/stop states update the control and animation without layout shift, with reduced-motion fallback.
- AC-004 [REQ-003, REQ-004]: Native Stop cancels a slow load without closing the guest, which can navigate again; frontend/native checks and repository gates pass.

## Behavior Delta

### MODIFIED
- REQ-001: Recheck live focus inside the selected web block before delayed shell focus.
- REQ-002: Replace page-load-only notifications with native source/start/completion events and navigation IDs.
- REQ-003: Replace the open button with Enter submission, a stable loading slot and refresh/stop toggle.
- REQ-004: Only successful completed loads and same-document routes qualify as history visits.

## Implementation and verification

- [x] Add native navigation event owner and stop adapter, plus state and real WebView2 regressions.
- [x] Extract address-bar presentation/editing, preserve delayed input focus and integrate loading/history state.
- [ ] Run focused/full frontend and Rust checks, inspect the loading controls, update module map and archive evidence.

Ownership: windows_navigation owns native navigation callbacks; navigation_state owns event ordering; WebAddressBar owns draft/input/loading presentation; useWebBrowser owns guest lifecycle and IPC; workspaceFocus owns selection focus. Existing large WorkspaceShell and LayoutView do not grow. Existing UI/module specifications apply. Standard embedded review passed: changes are bounded to browser presentation/navigation; no persistent schema, permissions, authentication or native dependency changes.


## Verification evidence

- AC-001: `workspaceWebFocus.test.ts` protects an already focused address input against the queued block-activation callback. Actual component preview single click from a different block retained input focus and accepted typing immediately.
- AC-002 / AC-004: `cargo test --lib native_webview_smoke -- --ignored --nocapture --test-threads=1` passed on real Windows WebView2. Covers pushState, replaceState, hash, back/forward, slow navigation Stop preserving a JavaScript document marker and guest, and navigation after Stop. Existing proxy isolation, guest IPC denial, native focus, clipping and overlay/frame checks also pass. The initial fixture timeout was a sequencing race: its forbidden-file navigation canceled the pending loopback load; the fixture now waits for route checks before running that interception case.
- AC-003: Actual WebAddressBar preview confirmed native Enter form submission with no open button, loading progress indicator and Stop/refresh swap. Input width remained 1053 px and the leading slot 16 px across both states. Reduced motion is covered by CSS assertion. IME composition and asynchronous draft preservation are covered by adjacent unit tests.
- Screenshots: `docs/qb-spec/evidence/QB-20261025-web-navigation/loading.png` and `route-synchronized.png`. These show the actual frontend component with simulated page state, not an SSH-connected app; native navigation is independently exercised by the real WebView2 test above. Temporary preview files/server were removed after inspection.
- `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, source-size gate (zero reminders), 21 Node script tests, TypeScript and Vite production build passed. Vite reports the existing large-chunk warning.
- Initial `pnpm check` passed source-size/lint but seven tests in four unrelated files timed out with default concurrency. A full run with `--maxWorkers=2` is used to resolve resource contention, without relaxing tests.
- Initial all-target/all-feature Rust run: 341 passed, 7 ignored, one existing SOCKS rejection fixture failed on Windows connection reset (10054). The forwarding implementation was not changed; a serial full rerun verifies this timing-sensitive fixture.

- Full bounded frontend rerun: `pnpm exec vitest run --maxWorkers=2` passed 197 files / 1194 tests; 1 file / 2 tests intentionally skipped. Together with source-size, lint, Node script tests and `pnpm build`, all frontend gate stages are green.

- Serial Rust full rerun finished with 341 passed / 7 ignored / 1 failed: `infrastructure::local::pty::tests::default_shell_routes_terminal_io_and_can_be_closed` expected synchronized clear sequences but cmd/ConPTY emitted a different sequence. The same test passed in the initial full run, then failed again in isolation. The SOCKS rejection fixture passed both serial and isolated rechecks. Neither `infrastructure/local/pty.rs` nor `infrastructure/ssh/forwarding.rs` has a working-tree diff. These results establish environment/timing-sensitive failures outside this browser change; no test assertions were weakened.
- Minimal remaining reproduction, from `src-tauri/`: `cargo test --all-targets --all-features default_shell_routes_terminal_io_and_can_be_closed -- --test-threads=1`. The repository-wide Rust gate is not fully green; browser acceptance has direct passing native and frontend evidence. Preserve this change as active until that gate is resolved rather than claiming complete repository verification or archiving prematurely.
- Implementation and UI review complete. No persistent preference/context update is needed for this local browser-control behavior. No installer/package build was run, since this change does not alter native dependencies, Tauri configuration or packaging.
