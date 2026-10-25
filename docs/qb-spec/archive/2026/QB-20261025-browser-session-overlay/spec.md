---
schema: 1
id: QB-20261025-browser-session-overlay
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Browser session restoration and overlay scrollbar interaction

Authorization: user approved implementation of both assessed improvements, explicitly confirmed that Qterm exit/restart preserves tabs and deliberate browser block deletion removes its records, and selected overlay scrollbars with enlarged hit targets instead of cursor movement. Preserve existing unrelated layout/tab drag edits in this checkout.

## Behavior Delta
### ADDED
- REQ-001: Restore browser tab URLs, titles, ordering and selection per stable block identity from cache after restart. Closing tabs updates that block; deleting a block/workspace removes its records. Hiding, disconnecting, component remounts and application exit do not delete records. Connection changes never replay another target's URLs.
- REQ-002: Save incrementally and flush on normal exit, with ordered atomic writes, validated versioned cache, no empty overwrite before hydration, and no delayed resurrection after deletion. Restore inactive tabs lazily within existing native page limits. Site data remains scoped to connection environments and is not deleted with tab records.
### MODIFIED
- REQ-003: Browser document horizontal/vertical scrollbars occupy no layout space. Default thumb thickness is 3px; proximity expands thumb/track to 9px within a 12px hit area. Drag capture follows pointer without jumping; release, cancellation and blur restore thickness. Wheel/keyboard/native scrolling and latest theme remain usable through dynamic updates. Ordinary nested document scrollers are supported; cross-origin frames and closed shadow roots retain their existing behavior.

## Acceptance
- AC-001 [REQ-001, REQ-002]: Tests restore multiple same-target blocks independently, preserve tab ordering/selection, remove closed entries, reject stale target updates and deleted-block callbacks, retain data across remount, and serialize close flush after pending saves. Corrupt/future/invalid caches are preserved and reported.
- AC-002 [REQ-003]: Real WebView2 demonstrates zero layout gutter, dynamic horizontal/vertical and nested overflow, 3-to-9px proximity expansion, trusted-pointer drag outside the thumb, release/cancel recovery and unchanged page geometry. Style/head replacement recovery and theme behavior remain protected.
- AC-003 [REQ-001, REQ-002, REQ-003]: Focused then full frontend/Rust checks pass, main-only IPC and existing popup/proxy smoke remain intact, module-size gate passes and evidence/documentation describe tested scope.

## Implementation plan
- [x] Add domain/port/atomic cache adapter and thin trusted IPC. Single versioned cache contains independently keyed block records; no workspace schema migration or site-data change.
- [x] Add a frontend session-snapshot owner and serialize its writes with existing workspace persistence/close flush. Keep tab lifetime in WebTabs and restoration lazy.
- [x] Add a guest-only overlay controller with scoped geometry/drag owners, using the existing document presentation lifetime. Hide native bars only for successfully enhanced scrollers; no guest IPC or cursor warping.
- [x] Cover cache lifecycle and real native scrolling, run repository checks, update Directory Map/browser docs and archive evidence.

Embedded review: normal feature tier; persistence is disposable local recovery state, not credentials/configuration. Cache failures do not erase the original. No independent review required. New cohesive source modules stay below repository limits; stable entry modules only wire owners. AC-001 maps to Rust cache + frontend store/persistence/tab tests; AC-002 to DOM lifecycle + native input smoke; AC-003 to full gates and native security regression.

## Verification evidence
- AC-001: Atomic cache/service restart and validation tests, session-store isolation/deletion/stale-callback tests, ordered persistence/close-flush tests and lazy tab rendering/remount tests pass. Failed cache reads stay read-only; normal close saves the latest selection/content projection.
- AC-002: Real native smoke passed in 39.88 seconds. Assertions cover dynamic root/nested horizontal/vertical zero-gutter overflow, actual overlay palette, style/head/host removal recovery, all four trusted-pointer drags from the enlarged hit area, pointer capture outside the rail, release/cancel/blur and stable viewport dimensions. Rest/hover/release screenshots were visually inspected.
- AC-003: Bounded-worker `pnpm check` passed 1375 frontend tests and 21 Node script tests, lint/typecheck/build and source-size. Final title-control normalization received 6 focused tests, lint/typecheck and another production build. Rust all-target/all-feature suite passed 364 tests (7 ignored), formatting and Clippy passed. Existing Vite chunk-size warning remains; no assertions/timeouts were relaxed.

See `docs/qb-spec/evidence/QB-20261025-browser-session-overlay/README.md`. Public Baidu search interaction is not claimed as reproduced by the deterministic native fixture. Cross-origin frames, closed shadow roots and website-drawn scrollbars retain their existing behavior. No release package, commit or push was requested or performed.
