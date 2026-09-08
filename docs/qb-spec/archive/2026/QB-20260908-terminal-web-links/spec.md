---
id: QB-20260908-terminal-web-links
type: feature
tier: standard
status: archived
created: 2026-09-08
updated: 2026-09-08
supersedes: []
---

# Terminal web links and external-link confirmation

## Goal

Recognize plain-text HTTP and HTTPS URLs in terminal output and require an explicit risk confirmation before Web Links or OSC 8 links open in the system browser, without navigating or refreshing the Qterm WebView.

## Scope

- Add the official xterm Web Links addon version aligned with xterm 6.
- Load one Web Links addon for each newly created persistent xterm view.
- Route Web Links and OSC 8 activation through one terminal-owned risk confirmation before Qterm's shared HTTP/HTTPS external opener.
- Show the full target URL and explain that terminal output can be controlled by remote hosts or programs before invoking the system browser.
- Preserve xterm-owned link rendering, hover behavior, wrapped-line handling, and OSC 8 priority.

## Non-Goals

- Recognizing bare domains without an explicit `http://` or `https://` scheme.
- Supporting relative paths, local files, SSH URLs, commands, or non-web schemes.
- Adding custom URL regexes, tooltips, context menus, remembered approvals, or settings.
- Reimplementing the addon's matching algorithm or changing terminal output bytes.

## Requirements

- REQ-001: Plain-text absolute HTTP and HTTPS URLs in terminal output must become interactive through the official xterm Web Links addon.
- REQ-002: Activating a detected Web Link or OSC 8 link must first show a compact confirmation that identifies its source, displays the full URL, and explains the risk of terminal-controlled output.
- REQ-003: Invalid, relative, and non-HTTP/HTTPS targets must not invoke an opener backend.
- REQ-004: A persistent xterm view must load the addon exactly once at creation and retain it across React reparenting.
- REQ-005: Terminal selection/input/scrollback, file-preview links, xterm-owned link presentation, and existing addon lifecycles must remain unchanged.
- REQ-006: Confirming must invoke the shared opener exactly once; cancelling must not invoke it, and an opener failure must keep the dialog available with actionable feedback.

## Behavior Delta

### ADDED

- REQ-001: Explicit plain-text HTTP/HTTPS URLs in terminal output are now interactive.
- REQ-002: Detected Web Links and OSC 8 links now pause at the same terminal risk confirmation before using the safe system-browser route.

## Acceptance

- AC-001 (REQ-001, REQ-002): Web Links and OSC 8 adapters prevent default navigation and delegate valid targets to the terminal confirmation owner rather than directly invoking the opener.
- AC-002 (REQ-003): The shared external URL tests continue to reject relative, malformed, and unsafe schemes without invoking Tauri or browser navigation.
- AC-003 (REQ-004): TerminalPanel wiring tests prove the addon is loaded on initial xterm creation and no second terminal/addon is created when the same session is reparented.
- AC-004 (REQ-005): Focused Web Links, OSC 8, external URL, Markdown preview, and TerminalPanel suites pass without custom link presentation or URL regex changes.
- AC-005 (REQ-001, REQ-005): Dependency lockfiles, source-size ratchet, lint, typecheck, frontend tests, production build, and desktop bundle build pass.
- AC-006 (REQ-002, REQ-003, REQ-006): The confirmation test proves the full URL and risk copy are shown, cancel performs no open, confirm performs one open, invalid targets do not prompt, and opener failure remains recoverable.

## Assumptions And Risks

- The official addon owns URL matching, including punctuation and ordinary wrapped lines. Known upstream edge cases involving absolute cursor positioning remain outside Qterm's matching layer.
- Terminal output may contain misleading display context around a valid URL. Qterm therefore shows the actual target and asks for confirmation on every terminal-link activation; remembered trust is outside this scope.

## Implementation Steps

- [x] Add and lock `@xterm/addon-web-links@0.12.0`.
- [x] Add `terminalWebLinks.ts` as the xterm addon factory and protect its activation behavior with focused tests.
- [x] Load the addon once during persistent terminal creation and protect reparenting behavior without growing TerminalPanel hotspots.
- [x] Add one terminal-owned confirmation host and route both Web Links and OSC 8 activations through it.
- [x] Protect confirmation, cancellation, invalid-target, and opener-failure behavior with focused tests.
- [x] Update the Directory Map and complete standard verification.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Focused `terminalWebLinks` and `terminalOsc8Link` adapter tests. |
| AC-002 | Existing `externalUrl` policy suite. |
| AC-003 | TerminalPanel persistent-view suite and addon load assertion. |
| AC-004 | Focused terminal/link/Markdown suites and source inspection. |
| AC-005 | `pnpm check` and Tauri App bundle build. |
| AC-006 | Focused `TerminalExternalLinkConfirmation` interaction tests. |

## Quality Check

The supported syntax, official dependency boundary, lifecycle owner, preserved behavior, security constraints, and verification mapping are explicit. Every requirement has observable acceptance coverage and no blocking ambiguity remains.

## Verification Evidence

- AC-001: Focused Web Links and OSC 8 adapter tests prove both handlers prevent WebView-default navigation and submit the URI plus source type to the terminal confirmation boundary instead of invoking the opener directly.
- AC-002: The shared external URL suite accepts absolute HTTP/HTTPS and rejects relative, malformed, `javascript:`, `file:`, and `ssh:` targets; the confirmation suite additionally proves an unsafe target never creates a dialog or opener call.
- AC-003: The TerminalPanel persistent-view test proves the initial terminal owns Fit, Web Links, and Search addons and keeps the same terminal instance and three addon registrations after React reparenting.
- AC-004: Focused Web Links, OSC 8, confirmation, confirmation styles, external URL, Markdown preview, TerminalPanel, and App suites pass (8 files, 69 tests). xterm remains the owner of link recognition and presentation.
- AC-005: `@xterm/addon-web-links@0.12.0` remains pinned. `pnpm check` passes source-size with zero reminders, ESLint, 135 frontend test files / 960 tests, 17 script checks, TypeScript, and the production Vite build. `pnpm tauri build --bundles app` compiles, bundles, and signs `Qterm.app` with the HTTP/HTTPS opener capability.
- AC-006: Four focused confirmation interaction tests prove the actual URL and risk copy appear before opening, Web Link confirmation invokes the opener once, OSC 8 cancellation invokes it zero times, unsafe targets do not prompt, and opener failure preserves the dialog with retry feedback.
