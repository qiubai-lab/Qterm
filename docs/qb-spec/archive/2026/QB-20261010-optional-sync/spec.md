---
schema: 1
id: QB-20261010-optional-sync
type: feature
tier: strict
status: archived
created: 2026-10-10
updated: 2026-10-10
supersedes: []
---

# Optional connection synchronization

Authorization: user requested implementation of the evaluated Docker/GHCR/SQLite service and a separate optional System Settings → 同步 entry with address and token.

## Requirements
- REQ-001: Synchronization is disabled by default; settings support enable, endpoint, masked replacement token, manual synchronization and visible status. Disabling prevents subsequent requests.
- REQ-002: Synchronize profiles, groups and ordered jump references; never transmit credential IDs/material, known hosts, sessions, network rules or device settings. Preserve local credential bindings only for unchanged authentication targets.
- REQ-003: Offline edits survive restart; three-way merge by stable ID preserves independent changes and deletions, stops on conflicting record edits, and offers explicit local/remote conflict resolution. First enable explicitly authorizes merging existing catalogs; no name-based deduplication.
- REQ-004: Service runs independently in Docker with normalized SQLite tables, authenticated API, bounded requests, transactional compare-and-swap, persistent storage and GHCR publication workflow.
- REQ-005: Token remains in native credential storage; HTTPS verifies certificates and disallows redirects. Explicit insecure-HTTP opt-in supports isolated local networks. Server stores a configured token digest. Protocol and database versions are independent of desktop JSON schema.
- REQ-006: Crash recovery protects the local catalog/baseline transition; concurrent local edits cannot be overwritten. Remote server identity/revision regression stops synchronization. Existing SSH sessions never reconnect automatically.

## Acceptance
- AC-001 (REQ-001): settings default off; saving and failures are tested; disabled service does not contact transport.
- AC-002 (REQ-002): serialization excludes credentials; local bindings retained only when host/port/user/auth are unchanged; missing jump credentials do not corrupt storage and remain rejected at connection time.
- AC-003 (REQ-003): two clients converge after independent edits and deletion; edit/edit and edit/delete conflicts preserve data; explicit resolutions apply only to a freshly inspected conflict snapshot.
- AC-004 (REQ-004): SQLite tables contain individual records; unauthorized requests and stale writes rejected; valid writes are atomic; Docker and workflow assets supplied.
- AC-005 (REQ-005): malformed URL, redirect, unknown fields and oversized data rejected; token never returned through IPC snapshots or logged.
- AC-006 (REQ-006): recovery journal and local compare-and-swap tests protect crashes/races; server replacement/rollback rejected; no SSH runtime calls in sync.

## Behavior Delta
### ADDED
- REQ-001: optional synchronization settings and runtime.
- REQ-003: conflict-aware catalog synchronization.
- REQ-004: self-hosted service and image publishing.
### MODIFIED
- REQ-002: stored jump topology may reference a profile awaiting local credentials; connection-time eligibility checks remain strict. Previously storage itself required available credential references.

## Design review
PASS WITH NOTES: authorized scope is clear. First release uses bounded full catalog reads with per-entity three-way merge and atomic catalog revision CAS, not an incremental change log. SQLite stores normalized entities, not JSON files. This reduces cursor/tombstone compaction risks for small catalogs; unchanged polls do not write the server database. Conflict resolution is explicit. Network-rule-dependent deletions stop locally until the user removes those rules. No remote deployment or image publication is performed in this task.

## Verification
Implemented; VER-001 through VER-005 evidence is recorded in the companion plan. Automated desktop/core/server checks and Windows packaging passed. Docker runtime/build and native macOS/Linux credential-store validation remain explicitly unverified environment limitations; rollout requires the documented container smoke check. No image was published or service deployed.
