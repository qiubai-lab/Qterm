---
schema: 1
id: QB-20261025-web-opener-interception
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Webpage anchor interception by the opener plugin

The user reported that the earlier popup fix still fails, with `opener.open_url not allowed` in the guest console, and requested continued diagnosis and repair. This authorizes the scoped correction. Follow-up to QB-20261025-web-popup-tabs; its previous native evidence omitted the production opener plugin and was insufficient to prove production anchor behavior.

The pinned opener 2.5.4 default injects a window click listener into every webview. It calls preventDefault on blank-target HTTP links and invokes the external opener, which the guest capability correctly denies. This occurs before NewWindowRequested. The application uses this default; the previous smoke builder did not load the plugin.

## Behavior Delta
### MODIFIED
- REQ-001: User-clicked webpage blank-target links reach the existing native popup/tab flow instead of being canceled by the opener plugin. Preserve source page, local/SSH routing and native POST/opener behavior.
- REQ-002: External opening remains an explicit trusted application action. Guest application/opener permissions and URL policy remain unchanged.

## Acceptance
- AC-001 [REQ-001]: With the production opener configuration installed, native local and remote anchor clicks produce child pages, retain the source, and trigger no opener invoke or unhandled rejection. Opt-in real Baidu click also succeeds.
- AC-002 [REQ-002]: Explicit external-opening frontend checks pass; the plugin is still installed and direct guest opener calls are rejected. Existing native popup lifecycle/POST/opener/proxy checks pass.

## Plan and ownership
- [x] Reproduce the failure by adding the production opener plugin to the native smoke.
- [x] Own opener configuration in a narrow infrastructure factory shared by application and smoke; disable automatic JS click interception while retaining explicit commands. No domain/frontend state or capability change.
- [x] Protect actual anchor clicks, guest rejection and production plugin wiring; run native smoke, full frontend checks, source-size, fmt, Clippy and Rust checks. Preserve the about-dialog project link through the explicit opener boundary with failure/retry coverage.
- [x] Correct prior evidence limitations, update Directory Map/browser behavior notes and archive with results.

Embedded review: avoids granting remote pages external-opener authority or rewriting webpage links. No dependencies, persisted schema or packaging changes. Growth budget: small shared factory, test helpers under existing source limits, one-line composition change. Architecture and critical behavior gates are satisfied by shared plugin wiring and real native request/permission regression coverage; no new state owner.

## Verification

AC-001 and AC-002 passed. The old default configuration reproduced a native popup timeout when the opener plugin was added. After disabling only its click interception, native smoke with production plugin registration passed local/remote and real Baidu mouse-click cases (trusted event, default not prevented, no unhandled rejection); direct guest opener calls remain denied. Existing native POST/opener/profile/lifecycle checks pass. [Evidence](../../../evidence/QB-20261025-web-opener-interception/README.md) includes source and child captures, reproduction commands and the previous test omission.

`pnpm check` passed: 1336 frontend tests and 21 script tests plus lint/typecheck/build. Rust fmt, Clippy and full all-target/all-feature suite passed: 361 passed, 0 failed, 7 ignored. The earlier terminal clear-screen failure did not recur; terminal sources are untouched. Source-size passed with zero ratchet reminders and `git diff --check` passed.

Full-workbench manual mouse validation was not completed because the desktop automation runtime failed initialization. The passing production-plugin native pointer tests and existing React tab/adoption integration provide the acceptance evidence; do not describe the isolated captures as full workbench screenshots. Application startup must use the rebuilt binary; an old process needs restarting. No release build or commit/push performed.
