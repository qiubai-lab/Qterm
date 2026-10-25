---
schema: 1
id: QB-20261025-web-tabs-profiles
type: feature
tier: strict
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Connection-scoped browser tabs and storage

User authorized implementation of the preceding evaluated design: header tabs, connection isolation with cross-block sharing, persistent browser profiles under cache, address-field clearing popover, and a future master-password protection boundary without extra encryption today.

## Behavior Delta
### ADDED
- REQ-001: A browser block supports adding, switching and closing independent pages in its header. Background pages retain navigation and DOM state; only the selected page is visible. Closing the last tab yields an empty page. Block dragging must not consume tab controls.
- REQ-002: A clearing popover inside the address field offers resource cache (default), cookies/login and site storage (both opt-in). It scopes operations to this connection across blocks, preserves history/bookmarks, reports busy/error/success, and supports outside/Escape dismissal when idle.
- REQ-003: Browser storage has an explicit native-protection mode and an extension boundary for future master-password unlock/migration. Unsupported protection modes fail closed; there is no misleading encryption switch today.
### MODIFIED
- REQ-004: Replace per-page temporary/incognito environments with persistent connection environments under cache/web-profiles. Same connection identity shares site data across blocks; differing connection IDs or endpoint/account identities do not share. No cookies/tokens enter frontend events or configuration exports.
- REQ-005: Browser proxy lifetime is connection-aware: same-session pages reuse a listener, closing one page keeps remaining pages' listener alive, and other blocks retain their environments and can issue new requests through surviving sessions. Disconnected targets fail closed. In-flight TCP/WebSocket streams on a disconnected SSH session cannot migrate. Existing URL/guest IPC restrictions remain.

## Acceptance
- AC-001 [REQ-001]: Add/switch/close and per-tab title/loading tests; switching preserves mounted pages and hides inactive guests; header controls stop drag propagation; hidden guests avoid per-frame measurements.
- AC-002 [REQ-002]: Tests cover default selection, explicit destructive categories, disabled repeat submissions, scope messaging, failures, and backend category validation. Native fixture verifies selective cache clearing preserves cookies and cookie clearing is shared only within its profile.
- AC-003 [REQ-003]: Storage policy tests reject unsupported protected mode; an architecture note describes unlock, lock, migration and rollback boundaries without implementing cryptography.
- AC-004 [REQ-004]: Identity/path tests and isolated native fixtures verify same-profile cookie/storage sharing, different-profile separation and reopen persistence. Existing temporary profiles need no migration; no user data is deleted.
- AC-005 [REQ-005]: Gateway tests verify upstream replacement/removal and fail-closed routing; native creation continues to deny guest IPC and internal URLs. Full frontend and Rust gates pass.

## Spec review
PASS WITH NOTES: authorization is in the conversation; local exception replaces the older ephemeral browsing behavior. Authentication isolation, shared lifetime and cleanup are explicit. Scope excludes tab-list restore after app restart, cross-block tab drag, extra encryption and automatic window.open handling. Persistent site data does not promise server-side login validity.

## Verification
Verified 2026-10-25. TASK-001 through TASK-005 are complete.

- VER-001: `pnpm check` passed (206 frontend files, 1,242 tests; 21 script tests; lint, TypeScript and production build). Subsequent browser-focused run passed 77 tests; final tab metadata/keyboard coverage passed 2 tests, and final tabs/popover/address regression run passed 6 tests. Final `pnpm build` passed after UI polish.
- VER-002: Popover tests cover explicit category selection, scope, pending submission, failure, outside/Escape dismissal and native activation. The real Windows WebView2 smoke fixture passed: resource-cache clearing preserves cookies, cookie/DOM clearing affects the shared profile only, and pause/restore works across views. All fixture data is local and temporary.
- VER-003: Domain and persisted-manifest tests reject unsupported master-password mode without creating a downgraded profile. `docs/browser-storage.md` records future lock/unlock, migration and rollback boundaries; no additional encryption is implemented.
- VER-004: Identity/path tests verify same identity reuse, connection/account/target separation and safe directory names. Native fixture verifies cookie/LocalStorage sharing, isolation, and disk persistence after the final view closes and reopens.
- VER-005: `cargo test --all-targets --all-features -- --test-threads=2` passed (352 passed, 7 ignored). The initial unconstrained run hit an existing local PTY timeout; reduced-concurrency full rerun passed. Final `cargo test web --all-features -- --test-threads=2` passed 26 tests after proxy lifetime and policy additions; final native smoke passed separately (1 test). Final `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` passed. Source-size check has zero ratchet reminders; `git diff --check` passed.

Review: connection identity originates from the validated SSH route; guest IPC/URL restrictions remain in place. Shared listeners survive individual tab closure. Closing an SSH session can interrupt its existing TCP/WebSocket streams; new requests use surviving same-identity routes. Site-data persistence does not restore the tab list or guarantee server-side login validity.

Visual verification limit: desktop UI automation could not initialize (`failed to write kernel assets`, missing runtime path), so no integrated screenshot/manual visual claim is made. Actual WebView2 behavior was verified by the native fixture. No dependency/packaging change or desktop release build was needed.
