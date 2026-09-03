---
id: QB-20260903-global-context-menu-guard
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Global browser context-menu guard

## Goal

Prevent the embedded web page's native context menu from appearing anywhere in Qterm while preserving every product-owned context menu.

## Scope

- One application-lifetime `contextmenu` listener owned by the React app shell.
- Native browser/WebView context-menu suppression on surfaces without a Qterm menu.
- Compatibility with existing Terminal, Files, Git, Network, and connection-management right-click handlers.
- Focused lifecycle and propagation tests.

## Non-goals

- Adding new Qterm context menus to surfaces that do not have one.
- Changing menu actions, keyboard shortcuts, text selection, clipboard commands, or developer-tool shortcuts.
- Native operating-system menus outside the WebView document.

## Requirements

- REQ-001: A context-menu event anywhere in the Qterm document must have its browser default prevented.
- REQ-002: The global guard must not stop event propagation, so existing component-owned context-menu handlers still receive the event and open their Qterm menus.
- REQ-003: The listener must be installed for the app lifecycle and removed when its React owner unmounts, including Strict Mode mount cleanup.
- REQ-004: The guard must not intercept unrelated pointer, keyboard, selection, or clipboard events.

## Acceptance

- AC-001 [REQ-001]: Right-clicking an element without a Qterm menu produces a cancelled `contextmenu` event and no native web menu.
- AC-002 [REQ-002]: A descendant `onContextMenu` handler still runs once while the event remains default-prevented.
- AC-003 [REQ-003]: Unmounting the owner removes the document listener and a later context-menu event is no longer cancelled by it.
- AC-004 [REQ-004]: The implementation registers only `contextmenu` and does not add handlers for other input events.

## Behavior Delta

### ADDED

- REQ-001: Qterm suppresses the embedded browser's native context menu globally.

### MODIFIED

- REQ-002: Existing Qterm context menus continue receiving right-click events through the global guard.
- REQ-003: Context-menu suppression now has an explicit React lifecycle owner.
- REQ-004: Other input behavior remains unchanged.

## Quality check

- Requirements cover blank surfaces, custom-menu propagation, cleanup, and non-interference.
- No product, security, persistence, transport, or platform ambiguity blocked implementation.

## Verification evidence

- AC-001 through AC-004: focused guard tests passed, including blank targets, custom-handler propagation, cleanup, and source event-scope assertion.
- Existing Terminal, Files, Git, Network, and connection-management context-menu suites passed.
- Focused verification: 8 test files, 164 tests passed.
- `pnpm check:source-size`: passed with 0 ratchet reminders.
- `pnpm check`: ESLint, 96 Vitest files / 823 tests, 13 Node tests, TypeScript, and Vite production build passed.

## Residual risk

- Native WebView behavior was not manually recorded; DOM cancellation and all product-menu propagation paths are covered automatically.

## Blockers

None.
