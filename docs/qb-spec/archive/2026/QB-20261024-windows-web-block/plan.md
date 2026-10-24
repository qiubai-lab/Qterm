---
schema: 1
id: QB-20261024-windows-web-block
type: feature
tier: strict
status: archived
created: 2026-10-24
updated: 2026-10-25
supersedes: []
---

# Implementation and evidence

- [x] TASK-001 [REQ-001, REQ-005]: Add Web layout, persistence mapping and compact block header/action; preserve schema readability.
- [x] TASK-002 [REQ-002]: Ephemeral loopback SOCKS5 listener with assigned port and existing Network session cancellation.
- [x] TASK-003 [REQ-003, REQ-004]: Windows native host, isolated browser directory, navigation restrictions, IPC guard and native lifecycle.
- [x] TASK-004 [REQ-001, REQ-004]: Wire authenticated runtime, browser controls, geometry and overlay visibility.
- [x] TASK-005 [AC-001, AC-002, AC-003, AC-004, AC-005]: Regression tests, repository gates, native Windows verification and Directory Map.

## Verification

- VER-001 [AC-001, AC-005]: Frontend layout and Rust workspace round-trip tests; pnpm check.
- VER-002 [AC-002]: SOCKS5 real SSH forwarding/cleanup integration tests.
- VER-003 [AC-003]: URL and guest authority tests; native denied navigation/IPC checks.
- VER-004 [AC-004]: Lifecycle/visibility tests and Windows desktop screenshots.
- VER-005 [AC-001, AC-002, AC-003, AC-004, AC-005]: cargo fmt/clippy/test and Windows packaging build (native feature configuration changes).

## Evidence (Windows x64, 2026-10-25)

- VER-001: Web layout reducer preserves the terminal; Rust JSON round trip saves only block/profile. All existing workspace migration tests pass. `src/web/WebBlock.test.tsx` exercises address submission, authentication handoff, creation after connection, disconnect and invalid-address recovery. Final full frontend run `pnpm exec vitest run --maxWorkers=2`: 186 files / 1170 tests passed, 1 file / 2 tests skipped; the Web feature has 8 passing tests. Full ESLint, TypeScript/Vite build, 21 Node script tests and source-size check (zero ratchet reminders) passed.
- VER-002: `real_ssh_web_proxy_is_profile_bound_and_cancels_streams_and_listener` passes against an in-process russh SSH server: domain and loopback destinations, concurrent HTTP requests, profile mismatch, distinct ephemeral ports, active-stream and incomplete-handshake cancellation. This exposed and fixed an existing Network-session cleanup mutex deadlock.
- VER-003: URL rules reject local protocols, reserved application hosts and embedded credentials. The native WebView2 smoke test loads two guests through separate SOCKS5 fixtures, confirms guest application IPC rejection and cookie isolation, and rejects file navigation. Navigation preserves the original origin and therefore normal browser TLS certificate checks; certificates are never bypassed. Popup/download denial is enforced by native callbacks.
- VER-004: Hook tests cover late creation after unmount and reopening the latest address after reconnect. Visibility tests cover inactive/inert workspace and modal suppression; native smoke covers bounds, hide/show and close. Native screenshot: `docs/qb-spec/evidence/QB-20261024-windows-web-block/windows-native.jpg`. Browser integration and actual SSH transport are verified in separate fixtures, not against a user's private service. The screenshot is the isolated native test host, not the complete product workbench.
- VER-005: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` pass. `cargo test --all-targets --all-features`: 332 passed, 7 environment-dependent tests ignored; the ignored native WebView2 test was explicitly executed and passed separately (1.86 seconds). Windows WebView2 Runtime 155.0.4283.62. Final `pnpm tauri build` passed after the frontend-copy refresh and produced `src-tauri/target/release/bundle/msi/Qterm_0.5.7_x64_en-US.msi` and `src-tauri/target/release/bundle/nsis/Qterm_0.5.7_x64-setup.exe`. `git diff --check` passed.

## Implementation notes

- Verification environment: default-concurrency `pnpm check` reruns encountered unrelated existing UI timing failures (8 timeouts during simultaneous native compilation; a later run had a Git parser wait and a Git operation timeout). Targeted reruns passed, followed by the complete suite passing with two workers and unchanged timeouts. No test assertions or test timeouts were relaxed. The constituent lint/test/build gates pass; the default-concurrency aggregate itself is not reported as a clean final run.

- Entry: remote terminal header menu → 通过此连接打开网页 → address → 打开. The existing profile and jump route are reused through an independent Network-purpose SSH connection; the terminal stays usable.
- WebView2 proxy arguments must be included in `additional_browser_args`: Wry 0.55 replaces its generated proxy arguments when this option is present. The native test protects the effective proxy, loopback routing and remote DNS behavior.
- Windows accepted sockets inherit nonblocking mode; the native test fixture explicitly restores blocking I/O. The application uses Tokio sockets.
- The MSVC linker embeds the same Common Controls v6 dependency for application and native test executables. Tauri's duplicate resource manifest is disabled only on MSVC, preserving other platform build behavior.
- Main-window notifications use `get_window` because a window containing multiple WebViews is no longer a Tauri `WebviewWindow`.
- New owners are recorded in Directory Map. Persistence record mapping and layout presentation helpers were extracted from existing hotspots; source-size baselines were tightened, with no new exemption.

## Scope and rollback

Windows desktop only. Downloads and popup windows are deliberately disabled. Web history/URLs/login state are not restored after application restart; only the block/profile are persisted. Existing v10 layouts load in this build, but older binaries cannot understand a Web node: close Web blocks before downgrading. No macOS/Linux native support or private-site compatibility is claimed.
