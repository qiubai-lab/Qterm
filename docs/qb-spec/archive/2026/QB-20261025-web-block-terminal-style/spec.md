---
schema: 1
id: QB-20261025-web-block-terminal-style
type: design
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Web Block terminal styling and connection selection

Authorization: user requests matching terminal styling, terminal-like connection selection, and automatic disconnection of the existing page when switching.

- REQ-001: Reuse terminal header, target picker, connection status/endpoint and close controls; compact neutral address toolbar follows existing workbench controls and theme tokens.
- REQ-002: Select SSH profiles through the existing searchable/grouped/recent picker. A different profile closes the old guest and SSH session, clears the URL, and remains disconnected until explicitly opened. Same-profile selection is a no-op.
- REQ-003: Rapid changes, pending native creation and pending authentication cannot restore old pages or overwrite the latest target/session. Workspace saves only the selected profile.
- AC-001 [REQ-001]: Shared header classes/components, compact toolbar, constrained widths and theme/focus styles verified by component/style tests and visual inspection.
- AC-002 [REQ-002]: Selecting another profile closes the existing guest, delegates session disconnection, persists the new profile and presents a blank disconnected page; no automatic authentication/navigation.
- AC-003 [REQ-003]: Deferred close and rapid retarget tests retain the latest target/session; existing late-native-creation tests pass.

## Behavior Delta

### MODIFIED
- REQ-001: Replace custom browser title/status/actions with terminal primitives.
- REQ-002: Previously fixed profile becomes selectable; old browsing state is discarded on switch.

## Implementation and verification

- [x] Reuse existing terminal primitives and extract browsing surface from the block header.
- [x] Extend Network-purpose profile selection to Web nodes and protect asynchronous close against newer epochs.
- [x] Cover selection, cleanup, concurrency and appearance; run focused checks and pnpm check (bounded test workers if needed on this host).

Ownership: WebBlock owns presentation and switch UI; Network controller owns target intent/session teardown; useWebBrowser owns native guest lifecycle; layout model owns persisted profile. Native IPC, SSH rules and schema stay unchanged. Existing modules remain below limits; LayoutView baseline must not grow. Standard embedded review passed: requirements and acceptance cover the requested behavior with no open scope questions.

## Verification evidence

- AC-001: WebBlock component and CSS tests verify shared terminal chrome, compact controls, shrink behavior and focus tokens. Rendered component fixtures visually inspected in dark, light and cyberpunk themes, including a 280px block; screenshots are in `docs/qb-spec/evidence/QB-20261025-web-block-terminal-style/`. These are component fixtures, not a live native SSH session.
- AC-002: WebBlock tests select through the real searchable picker, assert guest closure before selection finishes, empty address/history controls afterward, no automatic authentication/navigation, and same-profile no-op. webModel tests verify persisted Web profile changes without changing adjacent terminal targets.
- AC-003: useWebTargetSwitch tests defer multiple selections; useNetworkWorkspaceController tests resolve old SSH cleanup after the newest selection and session. WebBlock tests finish pending native creation after retargeting and verify its cleanup without reopening.
- Focused verification: 6 files / 14 tests passed. Source-size check passed with 0 reminders; LayoutView stays at its existing 638-line baseline.
- Initial `pnpm check`: 1176 frontend tests and 21 script tests passed; type checking found Node-only screenshot export helpers in new tests. Removed the export helpers. The attempted CSS `?raw` replacement was stubbed by Vitest; final implementation reuses the existing `readCssBundle` test helper with no dependency/configuration changes.
- Second `pnpm check`: source-size and repository ESLint passed; 1174 tests passed with two failures (the CSS helper issue above and an existing workspaceTabDeck preview test exceeding 5 seconds under default concurrency). Neither timeout nor assertions were weakened.
- Final affected checks: `pnpm exec vitest run src/web src/workspace/useNetworkWorkspaceController.test.ts src/app/workspaceTabDeck.test.tsx --maxWorkers=2` passed 7 files / 19 tests, including both preceding failures. `pnpm build` passed TypeScript and Vite production build (existing large-chunk warning). Focused ESLint passed after the final helper change. Reused the earlier full-suite/script evidence for unchanged code; `pnpm check` itself did not finish green in one invocation.
- Scope: frontend/controller-only follow-up. Native implementation is unchanged; native SSH/WebView live integration and installers were not rebuilt or revalidated for this styling change.
- Durable preference check: this restores the existing Qterm terminal style; no new global preference or long-lived style document is needed.
