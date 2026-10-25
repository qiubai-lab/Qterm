---
schema: 1
id: QB-20261025-local-browser-links
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Local browsing and terminal link destinations

Authorization: user approved the evaluated design with “请你落地”, including following the source terminal's local/SSH target. Existing worktree was clean at implementation start.

## Behavior Delta
### ADDED
- REQ-001: Browser blocks offer Local, using the computer's network without SSH, with shared local site data/history/bookmarks isolated from every remote environment.
- REQ-002: Terminal HTTP(S) and OSC 8 links can open internally, following the captured source terminal target. Reuse a same-target block in the source workspace and open a fresh tab (or its empty tab); otherwise split beside the source terminal. URLs remain transient.
### MODIFIED
- REQ-003: The confirmation offers equal-width horizontal internal/external buttons with semantic icons instead of Cancel/Continue. Preserve actual URI, provenance, close/Escape, failure feedback and repeat-submission protection.
- REQ-004: Local guests do not depend on SSH health. Remote guests retain authenticated routing, fail-closed disconnection, identity/storage separation and guest IPC/URL restrictions. Missing remote profiles never mean Local. Existing remote storage remains readable.

## Acceptance
- AC-001 [REQ-001, REQ-004]: Local creates/navigates without SSH, local/remote switching closes old guests, local library and persistent storage are isolated, existing remote manifests remain compatible.
- AC-002 [REQ-002]: Source capture survives active-workspace changes; closed source and missing profiles fail visibly. Reuse, fresh block, tab capacity, transient request consumption and authentication handoff are tested.
- AC-003 [REQ-003]: Both choices dispatch once, close/Escape dispatch neither, icons/equal-width layout and pending/failure states are covered. Native overlays continue to cover local guests.
- AC-004 [REQ-004]: Rust policy and native fixture prove local access, storage isolation, remote proxy arguments and guest restrictions. Full frontend and Rust gates pass.

## Ownership and compatibility

- Web target/network rules belong to web domain/native adapter; browser storage gets a separate trusted local directory. Existing remote manifest shape is unchanged.
- WorkspaceProvider composes a feature controller for transient open requests; WebTabs owns page instances and consumption. No second workspace store or persisted URLs.
- Terminal adapters report the invoking block, the confirmation captures its origin, and the workspace controller checks the source before opening.
- Existing nullable WebNode.profileId represents Local; a non-null missing profile remains unavailable. No workspace schema change. Existing empty unbound blocks become empty Local blocks without automatic navigation.
- Preserve remote library keys and add the reserved local scope; preserve native data protection and clearing semantics. No dependencies, release packaging, or cross-platform browser implementation.
- Growth budget: no growth in baselined LayoutView/TerminalPanel/WorkspaceShell; new orchestration lives in focused modules, other files remain under source-size defaults.

## Implementation and checks

- [x] Add native Local target/lifetime/storage and isolated library scope. AC-001/004: domain/storage tests and native WebView2 fixture.
- [x] Enable local selector/navigation and transient source-aware internal opens. AC-001/002: hook, block and tab tests.
- [x] Update confirmation layout, icons, origin capture and request lifetime. AC-003: component and style tests.
- [x] Run source-size, pnpm check, Rust fmt/clippy/tests, native smoke and inspect UI; update Directory Map and record evidence.

Embedded review: scope and acceptance closed. Additive local path does not relax remote routing or guest privileges. Critical protections focus on target distinction, stale requests and storage separation; rollback preserves existing remote files and leaves new local data intact.

## Verification and completion

All acceptance items passed on Windows on 2026-10-25. Evidence and coverage mapping: [verification record](../../../evidence/QB-20261025-local-browser-links/README.md).

- `pnpm check`: source-size (zero ratchet reminders), ESLint, 1325 frontend tests, 21 script tests, TypeScript and Vite build passed. Two additional source-adapter regression tests were added after this full run; their two files passed all 6 tests and focused ESLint.
- Rust: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test --all-targets --all-features -- --test-threads=2` passed (360 passed, 7 environment-dependent tests ignored). The separate Windows `native_webview_smoke` passed, including production Local lifecycle and separate remote proxy fixtures. After strengthening native readiness assertions and separating screenshot paths, smoke/fmt/clippy were rerun and passed.
- Production UI components were rendered for visual inspection in Cyberpunk, Light and a 360px Dark viewport. Buttons measured 172px each in the 390px dialog; failure feedback preserved its measured height. Local target selection, focus return and close behavior were verified.
- Directory Map and browser-storage documentation updated. No new dependencies, schema migration or package build. Existing remote manifests remain byte-compatible. Browser tabs and pending links remain transient. Windows-only internal browsing remains the existing platform boundary; external opening remains available elsewhere.

Architecture and critical-behavior review: target/lifecycle/storage ownership is explicit; provider is composition-only; terminal origin and pending request lifetimes have adjacent regressions; missing remote identities cannot enter the local network branch. No unresolved acceptance or verification blockers.
