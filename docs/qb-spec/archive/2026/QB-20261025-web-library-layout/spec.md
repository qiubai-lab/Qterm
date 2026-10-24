---
schema: 1
id: QB-20261025-web-library-layout
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Compact themed browser library and incremental recent history

Authorization: put compact History/Bookmarks tabs after search, widen the dialog, follow current theme and scroll more recent history within five rows.

- REQ-001: Search precedes compact 历史 / 收藏 tabs; dialog width increases to 660px within viewport gutters. Surfaces, selection and focus use existing theme tokens.
- REQ-002: Recent history initially renders five records, appends batches of five near the scroll end, and keeps a five-row viewport with a fixed full-history entry.
- REQ-003: Keyboard selection can load subsequent records, reopening resets to the first batch/top, and existing navigation, close animation and full-history behavior remain intact.
- AC-001 [REQ-001]: Component/style tests cover order, labels and theme tokens; inspect the actual components in normal and constrained layouts.
- AC-002 [REQ-002, REQ-003]: Test wheel/scroll pagination, exhaustion, keyboard navigation and reopening; inspect stable height as further records load.
- AC-003 [REQ-001, REQ-002, REQ-003]: Run focused tests, source-size and pnpm check; record any limitations accurately.

## Behavior Delta

### MODIFIED
- REQ-001: WebLibraryDialog and webLibrary.css own layout/theme changes. Bookmarking a history entry preserves its displayed page title.
- REQ-002: WebAddressBar supplies the already-loaded history (bounded to 200 per profile); WebAddressHistory owns incremental rendering. No additional IPC pagination or persistence changes.
- REQ-003: The same listbox selection drives keyboard batch expansion; native overlay geometry, connection isolation, loading and error contracts remain unchanged.

## Plan

- [x] Implement layout and incremental rendering in existing feature owners.
- [x] Complete regression and visual verification, record evidence and archive.

Growth budget: existing feature-local components remain below source-size limits; no baselined hotspot growth, dependencies, new module boundaries or Directory Map changes.

## Evidence

- AC-001: Actual React components rendered in an isolated local browser preview with 24 fixture visits. Verified 660px dialog, search preceding the compact tabs, cyberpunk yellow selection, light theme bookmark selection, and a 430px by 560px constrained iframe (search wraps above right-aligned tabs, footer stays visible). Screenshots: `docs/qb-spec/evidence/QB-20261025-web-library-layout/dialog.png` and `narrow.png`.
- AC-002: Browser wheel interaction grew rendered rows from 5 to 10 to 15 while measured viewport height stayed 196px. Scrolling exposed subsequent records with the shared scrollbar and fixed full-history entry. Opening that entry displayed the dialog. Reopening reset to 5 rows / scrollTop 0. Visual verification caught a programmatic reset scroll event incorrectly loading another batch; guarded zero scrollTop and added regression coverage. Screenshot: `recent-scrolled.png` in the evidence directory. Preview uses fixtures; native SSH/WebView layering was not re-tested for this frontend-only change.
- AC-003: Full check passed source-size (zero reminders) and ESLint, with 198 test files / 1220 tests passed, 1 file / 2 tests skipped and 1 unrelated GitChangePreview language-parser wait timeout. Scoped rerun of all web tests plus that Git test passed 15 files / 64 tests with two workers, without weakening assertions. All 21 Node script tests passed. Final ESLint, TypeScript and Vite production build passed. Vite retains its existing large-chunk advisory.
- No dependency, IPC, storage schema or native code changes in this slice. Temporary visual harness files were removed.
