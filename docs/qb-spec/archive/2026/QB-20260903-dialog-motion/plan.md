---
id: QB-20260903-dialog-motion
type: design
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Unified dialog motion plan

## Requirement

Implement REQ-001 through REQ-005 from the archived change spec.

## Scope

Shared modal entrance, Git change preview dismissal, existing Git modal consistency, reduced motion, and a production `role="dialog"` audit. Menus, tooltips, native dialogs, and domain behavior remain out of scope.

## Affected Files

- `src/components/dialogs/DialogFrame.tsx`, `dialogFrame.css`, `useDialogCloseTransition.ts`, and adjacent tests.
- `src/git/GitChangePreview.tsx` and its adjacent tests.
- Existing repository picker/conflict motion integration and tests.
- Style/audit tests and the Directory Map.

## Design

- Let `DialogFrame` CSS own the shared centered entrance and scrim fade.
- Let a narrow dialog-exit hook own the 130ms closing lifecycle and reduced-motion immediate path; feature components continue to own what completion means.
- Keep anchored popovers on their existing transform origins and source-oriented entrance animations.
- Preserve existing Qterm and engineering style constraints, including source-size ratchets and reduced-motion behavior.

## Implementation Tasks

- [x] Add shared modal/scrim entrance motion and reduced-motion fallback.
- [x] Introduce a narrow reusable exit lifecycle and wire Git change preview.
- [x] Consolidate repository picker/conflict exit timing.
- [x] Audit custom production dialogs and protect their existing entrance coverage.
- [x] Add focused behavior/style tests and run repository gates.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | DialogFrame style contract and component tests passed |
| AC-002 | GitChangePreview fake-timer close behavior test passed |
| AC-003 | Existing picker/conflict focused suites passed |
| AC-004 | Reduced-motion component and CSS assertions passed |
| AC-005 | Production dialog inventory and custom style assertions passed |

## Test / Verification

1. `pnpm check:source-size` — passed, 0 reminders.
2. Focused Vitest suites — passed, 132 tests.
3. `pnpm check` — passed, including 819 Vitest tests, lint, typecheck, and build.

## Documentation Updates

`docs/qb-spec/DIRECTORY_MAP.md` records the shared dialog presentation-lifecycle boundary.
