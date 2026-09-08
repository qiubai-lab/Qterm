---
id: QB-20260908-terminal-osc8-links
type: feature
tier: standard
status: archived
created: 2026-09-08
updated: 2026-09-08
supersedes: []
---

# Terminal OSC 8 external links

## Goal

Open explicit OSC 8 HTTP/HTTPS hyperlinks from local and remote terminals in the system browser without navigating or refreshing the Qterm WebView.

## Scope

- Configure xterm's built-in OSC 8 link handler for every newly acquired terminal view.
- Share one frontend-owned external URL policy and Tauri/browser opener adapter with Markdown file preview.
- Preserve xterm's built-in OSC 8 underline, pointer, and hover highlighting.
- Protect supported and rejected protocols with focused automated tests.

## Non-Goals

- Detecting plain-text URLs with `WebLinksAddon` or another linkifier.
- Opening relative paths, local files, SSH URLs, commands, or arbitrary schemes.
- Adding a custom tooltip, context menu, confirmation dialog, or persisted setting.
- Changing OSC 7 working-directory integration, terminal input, selection, scrollback, or session persistence.

## Requirements

- REQ-001: Activating an OSC 8 absolute HTTP or HTTPS link must open it through the shared external opener without navigating the Qterm WebView.
- REQ-002: Non-HTTP/HTTPS and malformed targets must not reach Tauri opener or browser navigation.
- REQ-003: The implementation must retain xterm's built-in OSC 8 rendering and hover behavior and must not make plain-text URLs clickable.
- REQ-004: External URL validation and desktop/browser dispatch must have one frontend owner reused by terminal and Markdown preview.
- REQ-005: Existing terminal view lifetime, OSC 7, input, selection, scrollback, and Markdown preview behavior must remain unchanged.

## Behavior Delta

### ADDED

- REQ-001: OSC 8 HTTP/HTTPS links now open in the user's system browser.
- REQ-004: Terminal and Markdown preview share one external URL policy and opener adapter.

## Acceptance

- AC-001 (REQ-001, REQ-003): A terminal created by `TerminalPanel` supplies an xterm `linkHandler`; activating an OSC 8 HTTPS target dispatches it exactly once through the shared opener.
- AC-002 (REQ-002): HTTP and HTTPS targets are accepted while relative, malformed, and non-web schemes are rejected without invoking either opener backend.
- AC-003 (REQ-003, REQ-005): No WebLinks addon or custom link presentation is introduced; existing TerminalPanel and Markdown preview regression suites pass.
- AC-004 (REQ-004): `TerminalPanel` and `MarkdownPreview` import the same capability module; presentation components do not duplicate Tauri/browser dispatch policy.
- AC-005 (REQ-005): The source-size ratchet, lint, typecheck, frontend tests, production build, and Tauri configuration build remain green.

## Assumptions And Risks

- OSC 8 content is controlled by the terminal process and may use misleading display text. Qterm therefore restricts activation to explicit HTTP/HTTPS targets, while the user remains responsible for choosing whether to click a displayed link.
- xterm 6 continues to own OSC 8 parsing and visual interaction. A future xterm upgrade requires rerunning the handler contract tests.

## Implementation Steps

- [x] Extract absolute HTTP/HTTPS validation and external opening into `src/lib/externalUrl.ts` with focused policy/adapter tests.
- [x] Migrate Markdown preview to the shared capability without changing its established link behavior or disabled-path presentation.
- [x] Wire xterm `linkHandler.activate` during terminal creation and add focused adapter plus TerminalPanel wiring regression tests.
- [x] Document the stable capability owner in the Directory Map and run tier-appropriate verification.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Focused TerminalPanel test invokes the configured handler and observes one shared opener call. |
| AC-002 | External URL unit tests cover HTTPS, HTTP, relative, malformed, and unsafe schemes. |
| AC-003 | Existing TerminalPanel and Markdown preview suites; repository inspection for addon/presentation changes. |
| AC-004 | Import and source inspection plus source-size gate. |
| AC-005 | `pnpm check` and Tauri bundle build. |

## Quality Check

The goal, non-goals, supported protocol boundary, preserved terminal behavior, and verification mapping are explicit. Every requirement has observable acceptance coverage, and no blocking product ambiguity remains.

## Verification Evidence

- AC-001: `TerminalPanel` supplies `terminalOsc8LinkHandler`; its focused adapter test proves activation prevents browser-default handling and delegates the OSC 8 URI exactly once to the shared opener.
- AC-002: `externalUrl.test.ts` accepts absolute HTTP/HTTPS and rejects relative, malformed, `javascript:`, `file:`, and `ssh:` targets without invoking either opener backend.
- AC-003/AC-004: The focused external URL, Markdown preview, OSC 8 adapter, and TerminalPanel suites pass (4 files, 53 tests). Repository inspection finds no `WebLinksAddon`; xterm remains the OSC 8 presentation owner. The Directory Map records the new capability boundaries.
- AC-005: `pnpm check` passes source-size with zero reminders, ESLint, 132 frontend test files / 954 tests, 17 script checks, TypeScript, and the production Vite build. `pnpm tauri build --bundles app` successfully parses the HTTP/HTTPS opener capability, compiles the release binary, and signs `Qterm.app`.
