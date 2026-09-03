---
id: QB-20260903-global-context-menu-guard
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Global browser context-menu guard plan

## Requirement

Implement REQ-001 through REQ-004 from the archived specification.

## Scope

Add one narrow application hook and wire it at the `App` composition root. Preserve all existing feature menu handlers and unrelated input behavior.

## Affected Files

- `src/app/useBrowserContextMenuGuard.ts` and its adjacent test.
- `src/app/App.tsx` for lifecycle wiring.
- `docs/qb-spec/DIRECTORY_MAP.md` for the stable application-level interaction owner.

## Design

- Register a capture-phase document `contextmenu` listener that calls only `preventDefault()`.
- Do not call `stopPropagation()` or inspect feature selectors; existing handlers remain authoritative for whether Qterm opens a menu.
- Remove the exact listener during effect cleanup.

## Implementation Tasks

- [x] Add failing tests for blank targets, custom-handler propagation, and cleanup.
- [x] Implement the application-level guard hook and wire it once.
- [x] Update the Directory Map and run focused/full verification.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | Plain-target context-menu cancellation test passed |
| AC-002 | Descendant React handler propagation test passed |
| AC-003 | Unmount cleanup test passed |
| AC-004 | Source assertion and focused code review passed |

## Test / Verification

1. Focused Vitest hook and existing menu suites — 164 tests passed.
2. `pnpm check:source-size` — passed, 0 reminders.
3. `pnpm check` — passed, including 823 Vitest tests, lint, typecheck, and build.

## Documentation Updates

The Directory Map records the application-level native context-menu guard owner.
