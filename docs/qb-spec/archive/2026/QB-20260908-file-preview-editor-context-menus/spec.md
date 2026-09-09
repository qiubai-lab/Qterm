---
id: QB-20260908-file-preview-editor-context-menus
type: feature
tier: standard
status: archived
created: 2026-09-08
updated: 2026-09-08
supersedes: []
---

# File preview and editor context menus

## Goal

Complete the foundational text context menus for file preview and editing so rendered Markdown, read-only code, and editable code expose predictable Qterm-owned actions without restoring the native WebView menu.

## Scope

- Add a Qterm context menu to rendered Markdown preview with Copy, Select All, and contextual Copy Link Address for HTTP/HTTPS links.
- Extend editable CodeMirror menus with Undo and Redo while retaining Cut, Copy, Paste, and Select All.
- Retain the existing read-only CodeMirror Copy and Select All menu and image preview Copy Image / Copy Path menu.
- Share viewport fitting, dismissal, focus, portal rendering, and keyboard navigation through one Files-owned text-menu surface.
- Show platform-appropriate shortcut labels and disable actions that are unavailable from the current selection/history/content state.

## Non-Goals

- Native operating-system or WebView context menus.
- Formatting, Markdown source transformations, search, replace, spellcheck, download, print, or file mutation actions.
- Clipboard image/file formats, clipboard history, persisted menu preferences, or changes to file I/O and save confirmation.
- Adding text actions to image preview or file-operation actions to content menus.

## Requirements

- REQ-001: Rendered Markdown preview must offer Copy and Select All, with Copy disabled when the current DOM selection is outside the preview or empty.
- REQ-002: Right-clicking an interactive HTTP/HTTPS Markdown link must additionally offer Copy Link Address using the actual target URL.
- REQ-003: Editable CodeMirror content must offer Undo, Redo, Cut, Copy, Paste, and Select All; read-only CodeMirror content must remain limited to Copy and Select All.
- REQ-004: Undo, Redo, Cut, Copy, and Select All availability must reflect the current editor selection, history, and document content at menu-open time.
- REQ-005: Text menus must fit within the viewport, render above file content, support pointer and ContextMenu/Shift+F10 entry, roving Arrow/Home/End navigation, and Escape/Tab dismissal with focus restoration.
- REQ-006: Existing editor keyboard bindings, multi-range clipboard behavior, save flow, link activation, theme styling, image menu, and global native-menu suppression must remain unchanged.

## Behavior Delta

### ADDED

- REQ-001: Rendered Markdown preview gains Qterm-owned Copy and Select All actions.
- REQ-002: Markdown web-link targets can be copied without opening them.
- REQ-003: Editable CodeMirror menus gain Undo and Redo actions.

### MODIFIED

- REQ-005: Files text context-menu positioning and keyboard lifecycle move from the CodeEditor-local implementation to one Files-owned shared surface, preserving its observable behavior.

## Acceptance

- AC-001 (REQ-001, REQ-005): Markdown pointer and keyboard entry open a preview menu; Copy reflects scoped selection, Select All selects preview content, and keyboard navigation/dismissal works.
- AC-002 (REQ-002, REQ-006): A Markdown web link exposes Copy Link Address with the actual href while ordinary content does not; link activation behavior remains covered.
- AC-003 (REQ-003, REQ-004): Editable CodeMirror menus expose all six actions, Undo/Redo enable only with matching history, and invoking them produces the expected document state.
- AC-004 (REQ-003, REQ-006): Read-only CodeMirror remains non-mutating and exposes only Copy and Select All; existing multi-range clipboard and failure feedback tests pass.
- AC-005 (REQ-005): The shared menu surface is covered for viewport fitting, focus entry, roving navigation, outside/Escape/Tab dismissal, and separators.
- AC-006 (REQ-006): Focused Files suites, source-size ratchet, lint, typecheck, frontend tests, and production build pass.

## Assumptions And Risks

- Clipboard text access continues through the existing Tauri clipboard plugin and permission set.
- DOM selection is accepted only when its range is fully contained by the Markdown preview; cross-surface selections do not become copyable through this menu.
- Menu availability is a snapshot taken when opened. Editing commands close the menu, so the next opening refreshes selection and history state.

## Implementation Steps

- [x] Add the Files-owned text context-menu presentation surface and focused interaction tests.
- [x] Refactor CodeEditor to consume the shared surface, add CodeMirror Undo/Redo commands, and preserve current clipboard behavior.
- [x] Add scoped Markdown selection/link-address actions and keyboard entry using the shared surface.
- [x] Update Files styles and Directory Map for the new stable capability owner.
- [x] Run focused and standard verification, record evidence, and archive the change.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `MarkdownPreview.test.tsx` pointer, selection, Select All, and keyboard tests. |
| AC-002 | `MarkdownPreview.test.tsx` contextual link-address and existing activation tests. |
| AC-003 | `CodeEditor.test.tsx` menu availability and Undo/Redo history tests. |
| AC-004 | Existing CodeEditor read-only, clipboard, multi-range, and feedback tests. |
| AC-005 | `FileTextContextMenu.test.tsx` positioning, navigation, and dismissal tests. |
| AC-006 | Focused Vitest, `pnpm check`, and `git diff --check`. |

## Quality Check

The three preview kinds, edit/read-only action matrices, keyboard/pointer paths, disabled states, link-specific behavior, preserved invariants, ownership boundary, and verification mapping are explicit. Every requirement has observable acceptance coverage and no blocking product ambiguity remains.

## Verification Evidence

- AC-001 and AC-002: `pnpm exec vitest run src/files/FileTextContextMenu.test.tsx src/files/CodeEditor.test.tsx src/files/MarkdownPreview.test.tsx` passed 17 tests, including Markdown scoped selection, Select All, contextual link copying, pointer/keyboard entry, focus restoration, and preserved link activation.
- AC-003 and AC-004: the same focused run passed editable Undo/Redo history, six-action availability, read-only action restrictions, multi-range clipboard behavior, and clipboard failure feedback.
- AC-005: `FileTextContextMenu.test.tsx` passed viewport fitting, initial focus, disabled-item skipping, Arrow/Home/End navigation, outside pointer dismissal, and Escape/Tab focus restoration; `fileTextContextMenuStyles.test.ts` passed shared presentation and disabled-state styling checks.
- AC-006: `pnpm exec vitest run src/files` passed 69 tests across 5 files. `pnpm check` passed the source-size ratchet with 0 reminders, ESLint, 968 tests across 137 frontend test files, 17 Node script tests, TypeScript checking, and the Vite production build. `git diff --check` passed.
- Dependency ownership: `@codemirror/commands` is pinned directly at `6.11.0` because the editor now imports its public Undo/Redo commands and history-depth queries.
- Residual note: Vite retained the repository's non-blocking chunk-size warning; no new verification failure or functional gap remains.
