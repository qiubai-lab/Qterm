---
schema: 1
id: QB-20261025-web-library
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Web Block history, bookmarks and quiet address field

Authorization: user explicitly requests history, bookmarks and less prominent address-input hover. Scope follows the existing Windows browser block; no guest permissions or workspace schema change.

- REQ-001: Persist recent visited HTTP(S) addresses and named bookmarks per connection profile; reconnect/restart retains them and different remote localhost targets stay isolated.
- REQ-002: Provide persistent toolbar actions, searchable history/bookmark lists, open again through the current connection, bookmark/unbookmark and confirmed history deletion/clear. A late event from a closed guest cannot record into a new connection.
- REQ-003: Preserve native page focus/visibility/connection switching; use existing dialogs and theme tokens, with quiet one-pixel address hover and clear keyboard focus.
- REQ-004: Bounded, atomic storage in the active device configuration; corrupted/future files must not be overwritten, failed writes cannot appear successful, concurrent block changes cannot lose updates.
- AC-001 [REQ-001, REQ-002]: Visit/load events deduplicate recent URLs; profile changes isolate data; saved bookmarks survive service recreation; list search/open and bookmark edits work.
- AC-002 [REQ-002, REQ-003]: Invalid/submitted-only/stale guest addresses are not visits; dialog open/close uses existing native hide/restore behavior; pointer and keyboard can use lists, confirmations and toolbar at compact widths.
- AC-003 [REQ-003]: Address hover/focus has no stacked shadow or thick ring; browser content remains dominant, keyboard focus remains visible.
- AC-004 [REQ-004]: Tests cover storage round-trip, bounds, failed/corrupt/future storage preservation, concurrent updates and frontend failure/retry. Repository checks pass.

## Behavior Delta

### ADDED
- REQ-001: Connection-scoped history and bookmarks saved in device/web-library.json, independent of transient browser sessions.
- REQ-002: Toolbar bookmark toggle and history/library dialog with two searchable tabs, reopen, rename bookmark and confirmed history removal.
- REQ-004: Schema v1 atomic repository with serialized read-modify-write; 200 recent URLs per connection, 2000 globally and 2000 bookmarks. History evicts oldest; bookmark limit reports an error instead of deleting saved items.

### MODIFIED
- REQ-003: Address field overrides shared form focus glow with a single subtle border; dialog visibility continues to suspend native presentation, not the browser session.

## Implementation and acceptance plan

- [x] Pure library rules, repository port, serialized application service and atomic JSON adapter; thin trusted-main commands.
- [x] Feature controller and compact library dialog; record native completed visits and wire bookmark/history actions.
- [x] Quiet field styles, adjacent regressions, UI inspection, frontend and Rust repository checks.

Design: device configuration storage follows existing root/flavor separation; browser localStorage would bypass that contract. A shared DialogFrame avoids new native overlay clipping. New modules each stay under repository limits; WebBrowserPane only composes capabilities. Embedded standard review: scope and acceptance are closed, no blocking ambiguity. URL records are user browsing data; no credentials/cookies/page contents are stored. Existing authentication and guest IPC denial remain intact.

## Verification

- AC-001 / AC-004: Four Rust library tests pass: disk round-trip/service recreation, profile isolation, duplicate visits, rename, history clear preserving bookmarks, per-profile history eviction, bookmark capacity, invalid input, failed writes, corrupt/future file preservation and 20 concurrent updates. Full Rust suite passed 341 tests (7 existing environment-dependent tests ignored). Final async command/worker dispatch passed all-target/all-feature Clippy with warnings denied; rustfmt passes.
- AC-001 / AC-002 / AC-004: Focused final frontend suite passed 26 tests in 11 files. Includes redirected completed visits, submitted/loading/other/late guest event exclusion, shared serialized store snapshots and failed-write retry, toolbar bookmark vs draft address, reopening a record through disconnected authentication, search/rename, nested confirmation/Escape and keyboard tabs.
- AC-002 / AC-003: Browser preview used the real React components and application styles with synthetic in-memory IPC records. Inspected history, bookmark rename, search, confirmation stacking and focus/hover. Computed address styles while both hovered and focused: border 1px, outline 1px, box-shadow none. Confirmed fixed footer and scrolling ownership; compact toolbar markup/layout tests remain green. Screenshots are in `docs/qb-spec/evidence/QB-20261025-web-library/`. These screenshots verify frontend layout/interaction, not a live SSH login or native filesystem IPC round-trip; persistence is covered by the real Rust adapter tests. No native WebView layering code changed.
- Repository gates: source-size passed with 0 reminders; ESLint, TypeScript and Vite production build passed; 21 Node script tests passed; git diff --check passed. Initial pnpm check hit a Vitest worker-process exit after 194 passing files. The complete suite rerun with --maxWorkers=2 passed 195 files / 1189 tests (1 file / 2 tests skipped), followed by the final focused suite including the new layout regression. No assertions or timeouts were weakened.
- Temporary preview files/server were removed after visual inspection. No release packaging was run for this routine feature change, in accordance with repository packaging guidance. Existing user browsing data and installed application were not modified by the preview.

Review: ownership remains domain rules → serialized application service → repository port/atomic adapter, with thin main-only async command dispatch. The frontend has one shared request/snapshot owner and presentation-only dialog state. No baseline growth or new dependencies. The address styling is a local adjustment within existing restrained-control guidelines, so no new durable style preference is inferred.
