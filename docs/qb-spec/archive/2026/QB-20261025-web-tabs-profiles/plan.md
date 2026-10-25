---
schema: 1
id: QB-20261025-web-tabs-profiles
type: feature
tier: strict
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Implementation and verification

- TASK-001 [REQ-004, REQ-005, AC-004, AC-005]: Introduce a connection identity/storage resolver and loopback connection gateway. Each authenticated guest registers a session-shared SSH SOCKS route; shared environments use one stable gateway port. Guest registrations are removed with pages; the SSH listener remains until the session's final page closes, and disconnected sessions are rejected. Keep runtime state in infrastructure/web, identity/protection rules in domain; no browser credentials in IPC.
- TASK-002 [REQ-002, REQ-003, AC-002, AC-003]: Add typed selective clearing through native Profile APIs with serialized environment operations and pause/reload around clearing; add native-protection storage policy and document future transition contract.
- TASK-003 [REQ-001, AC-001]: Dedicated tab controller/header view composes mounted page panes, title updates and active visibility. Limit tabs, retain last empty tab, preserve existing footer/history behavior. No page store in workspace persistence.
- TASK-004 [REQ-002, AC-002]: Address-field popover composes scoped category selection, pending/error states and native occlusion. No frontend filesystem or direct browser data reads.
- TASK-005 [AC-001, AC-002, AC-003, AC-004, AC-005]: Update Directory Map, run tests, native fixtures and gates; archive with evidence.

Growth budget: new owners below 250 production lines; split WebHost lifecycle from geometry/action façade before growing it. Preserve guest ID, session validation, URL policies, footer height and drawer interactions. No dependency or packaging change intended.

Architecture/critical behavior gates: connection identity includes immutable authenticated endpoint/account metadata; proxy and storage identity must agree. Gateway never connects directly to remote hosts. Clearing uses browser APIs, never recursive profile deletion. New persistent directories are additive; rollback leaves them unused and does not delete them. Future protection mode requires quiescing all owners before key access/migration, transactional completion and recovery; current mode requires no key.

- VER-001 [AC-001]: Focused frontend tabs/page visibility tests and pnpm check.
- VER-002 [AC-002]: Popover tests, clearing category tests and isolated native selective-clear fixture.
- VER-003 [AC-003]: Domain storage policy tests and review of documented protection boundary.
- VER-004 [AC-004]: Identity/path tests and isolated native shared/reopen profile fixture.
- VER-005 [AC-005]: Gateway routing tests, cargo fmt/clippy/test and existing native smoke tests where supported.

Completion: TASK-001 through TASK-005 and VER-001 through VER-005 are complete. Evidence and the desktop visual-verification limitation are recorded in the paired specification. Final review accepts the documented in-flight TCP limitation on SSH session disconnection; no cross-identity route or browser-data sharing is permitted.
