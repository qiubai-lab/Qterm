---
id: QB-20260903-credential-manager-selection-motion
type: design
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Credential manager selection motion plan

## Requirement

Implement REQ-001 through REQ-006 from the active specification.

## Scope

Add feature-local credential manager motion, wire it into the existing dialog, update the note icon, and persist the reusable design preference in the repository interface skill.

## Affected Files

- `src/components/dialogs/credential/useCredentialManagerMotion.tsx` and a small indicator presentation component.
- `src/components/dialogs/CredentialDialog.tsx`, `credentialDialog.css`, and adjacent tests.
- `.agents/skills/qterm-interface-design/` guidance and validation.
- `docs/qb-spec/DIRECTORY_MAP.md` for the credential motion owner.

## Design

- Keep list-target motion independent from delayed detail-state commit.
- Use one absolute indicator behind rows; selected rows contribute foreground styling only.
- Reuse the connection manager's 90ms exit, 200ms ordered entrance, 240ms creation entrance, and reduced-motion fade.
- Keep animation measurement and sequencing out of the baselined dialog component.

## Implementation Tasks

- [x] Add failing behavior/style assertions for single-surface selection, delayed ordered detail commit, creation motion, reduced motion, and the icon.
- [x] Implement the credential-local motion hook and indicator.
- [x] Wire the credential list/detail view without changing credential operations.
- [x] Update repository skill guidance and the Directory Map.
- [x] Validate the skill, focused behavior, source-size ratchet, and frontend repository gates.

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | CredentialDialog interaction test and selection-surface CSS assertion |
| AC-002 | Controlled WAAPI completion test for old/new content and direction |
| AC-003 | Creation interaction assertions and reduced-motion style assertion |
| AC-004 | Credential detail-note icon assertion |
| AC-005 | `quick_validate.py` plus focused skill-content review |
| AC-006 | Existing CredentialDialog suite, source-size ratchet, and `pnpm check` |

## Test / Verification

1. Focused CredentialDialog, motion, and theme tests — 3 files / 44 tests passed.
2. Repository skill quick validation — passed.
3. `pnpm check:source-size` and `git diff --check` — passed with 0 reminders/errors.
4. `pnpm check` — passed with 832 Vitest tests, 13 Node tests, lint, typecheck, and build.

## Documentation Updates

Update the repository Qterm interface skill and Directory Map; no product or backend documentation changes are required.
