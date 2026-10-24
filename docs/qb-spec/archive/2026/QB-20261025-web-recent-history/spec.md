---
schema: 1
id: QB-20261025-web-recent-history
type: feature
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Address dropdown and compact history dialog

Authorization: user requests five recent visits below the address input, a more-history modal entry, smaller footer buttons and Qterm scrollbar styling.

- REQ-001: Focus/click address input shows the current connection's five most recent visits and an always-available more-history entry.
- REQ-002: Pointer and arrow/Enter selection navigate through the existing controller; Escape/blur dismiss, IME and draft focus remain intact. More history opens the existing modal.
- REQ-003: The dropdown follows the input and only occludes its footprint over native guest content; existing modal/menu hiding and frame behavior stay intact.
- REQ-004: History list reuses OverlayScrollArea; footer controls become 24px inside a stable 40px footer.
- AC-001 [REQ-001, REQ-002]: Adjacent tests cover sorting/limit, empty state, selection, keyboard dismissal and more-history integration; inspect actual frontend interactions.
- AC-002 [REQ-003]: Occlusion regression keeps native guest visible for the marked dropdown only, restores it on dismissal, and keeps ordinary listboxes unchanged.
- AC-003 [REQ-004]: Verify shared scrollbar, footer dimensions, constrained list overflow and frontend gates.

## Behavior Delta

### ADDED
- REQ-001: WebAddressHistory owns anchored recent-history presentation; WebAddressBar owns input/keyboard state. WebBrowserPane passes existing per-profile library data.

### MODIFIED
- REQ-002: Address input becomes a semantic combobox with pointer and keyboard choices.
- REQ-003: webSurfaceOcclusion/webModel recognize only the explicitly marked address list as a partial native occlusion.
- REQ-004: WebLibraryDialog uses the shared overlay scrollbar and compact footer.

## Tasks

- [x] Implement dropdown, wiring and native overlap handling with adjacent tests.
- [x] Verify component interactions, constrained layout, source-size/lint/tests/build and update Directory Map.

Ownership review: no new persistence, IPC, dependencies or Rust changes; no baselined hotspot growth. New presentation module remains below source-size limits. Existing profile isolation, connection disposal, bookmarks and native frame handling are preserved.


## Verification and review

- AC-001: WebAddressHistory tests cover descending recency, five-item limit, pointer selection without blur, arrow/Enter selection, Escape/blur dismissal, empty history/more entry and hiding a workspace. WebBrowserPane integration verifies the more entry opens the existing per-profile modal. Existing IME and draft preservation regressions remain green.
- AC-002: webSurfaceOcclusion regression verifies an ordinary listbox still hides the native guest, while only the explicitly marked address popup keeps it visible and clips the overlapping rectangle. Removing the popup restores the uncut region. No Rust/native adapter changes were made; the established clipping path is reused.
- AC-003: Actual component preview checked pointer activation, more-history modal, scrolling, Escape focus return and keyboard Enter navigation. History footer measured 40 px, button 24 px, shared compact scrollbar 2 px with native scrollbar hidden. A 360 px block near the viewport bottom exposed a constrained-scroll issue; the scroll wrapper now uses column flex, measuring 158 px viewport / 196 px content with popup bottom at 712 in a 720 px viewport. Arrow navigation scrolls the fifth option into view while the footer stays fixed; the layout contract has a regression assertion.
- UI screenshots with sample data: `docs/qb-spec/evidence/QB-20261025-web-recent-history/recent-dropdown.png`, `history-dialog.png`, `compact-dropdown.png`. These are real frontend components using fixture data, not a connected SSH session. Temporary preview files, server and browser tab were cleaned up.
- `pnpm check` first caught synchronous effect state reset; replaced it with a conditional render-time state adjustment when the workspace hides. Lint then passed. Its full test stage ran 199 files: 197 passed, 1 skipped, and one theme-budget assertion failed because the new popup used a literal shadow color (1200 tests passed / 2 skipped / 1 failed). Replaced it with `--shadow-soft`; scoped rerun `pnpm exec vitest run src/app/themeStyles.test.ts src/web --maxWorkers=2` passed all 14 files / 59 tests. No unrelated tests failed in the full run and no assertions were relaxed.
- Final source-size check passed with zero reminders; `git diff --check` passed. `pnpm build` passed TypeScript and Vite, with the existing chunk-size advisory. All 21 Node script tests passed. The focused dropdown/integration/style/occlusion check additionally passed 11 tests after the constrained-scroll fix.
- Final ownership review: presentation and anchor geometry in WebAddressHistory; editing and keyboard state in WebAddressBar; per-connection data/lifecycle remain in existing hooks; native overlap selectors are narrowly scoped. Shared theme and scrollbar primitives reused. No persistent UI preference update, schema change, new dependency or package build required. The older navigation change's unrelated Rust gate limitation is not changed by this frontend-only feature.
