---
id: QB-20260903-credential-manager-selection-motion
type: design
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Credential manager selection motion

## Goal

Apply the connection manager's coherent single-selection and directional detail motion to credential management, and preserve the pattern as a repository-level Qterm interface preference.

## Scope

- One moving, theme-aware primary selection surface in the credential list.
- Immediate selection-target feedback without a duplicate static selected frame.
- Directional, two-phase credential detail transitions based on list order, plus a distinct create-stage entrance.
- A single-host icon for the credential deletion/reference note.
- Repository skill guidance for future single-selection list/detail managers.

## Non-goals

- Credential persistence, encryption, reveal, deletion, or connection-reference semantics.
- Dialog dimensions, toolbar actions, nested dialogs, or backend IPC.
- A generic animation dependency or application-wide state abstraction.

## Requirements

- REQ-001: Credential selection must use one moving primary surface that retargets immediately and never overlaps a second selected frame.
- REQ-002: Switching credentials must keep the old detail mounted during exit, commit the target once, and enter from the direction implied by credential order.
- REQ-003: Creating a password or private-key credential must use the established manager create-stage entrance while reduced-motion mode removes spatial movement.
- REQ-004: The reference-removal note must use the same single-host `computer` icon used by connection information.
- REQ-005: The repository Qterm interface skill must document the reusable selection and list/detail transition preference without coupling it to one feature.
- REQ-006: Existing credential security, focus, draft, nested-dialog, and persistence behavior must remain unchanged.

## Acceptance

- AC-001 [REQ-001]: Clicking another credential immediately moves the sole indicator target; the clicked row does not render an additional selected surface.
- AC-002 [REQ-002]: Before exit completion the old credential remains visible; after completion the new detail appears once with the correct up/down entrance class.
- AC-003 [REQ-003]: Both credential creation entry points use the create-stage class, and reduced-motion CSS replaces spatial motion with a short fade.
- AC-004 [REQ-004]: The deletion/reference note renders `data-icon="computer"` and no longer renders `connections`.
- AC-005 [REQ-005]: The changed repository skill validates and contains the single-surface, immediate-target, directional-detail, and duplicate-frame constraints.
- AC-006 [REQ-006]: Existing CredentialDialog tests and repository frontend checks pass.

## Behavior Delta

### MODIFIED

- Credential list selection changes from per-row selected frames to one moving primary surface.
- Credential detail replacement changes from an unconditional rightward entrance to ordered exit/enter motion.
- The credential reference note uses a single-host icon.
- Repository UI guidance now treats this motion pattern as the default for single-selection list/detail managers.

## Quality check

- Requirements cover pointer feedback, detail commit timing, creation, reduced motion, icon semantics, durable skill guidance, and unchanged security behavior.
- Motion orchestration has a feature-local owner under `src/components/dialogs/credential/`; no backend, schema, or security ambiguity blocks implementation.

## Verification evidence

- AC-001 and AC-002: controlled CredentialDialog interaction test passed, covering immediate sole-indicator targeting, retained old detail before exit completion, single commit, and downward entry.
- AC-003: credential motion style tests passed for ordered entry, creation entry, and reduced-motion fade.
- AC-004: CredentialDialog assertion passed for the `computer` icon and absence of `connections` in the reference-removal note.
- AC-005: `uv run --with pyyaml .../quick_validate.py .agents/skills/qterm-interface-design` passed with `Skill is valid!`.
- AC-006: focused verification passed with 3 files / 44 tests; `pnpm check:source-size` passed with 0 reminders; `pnpm check` passed with ESLint, 99 Vitest files / 832 tests, 13 Node tests, TypeScript, and the Vite production build.

## Residual risk

- Motion feel was not recorded from the desktop WebView; deterministic timing, direction, sole-surface behavior, reduced motion, and theme-token use are covered automatically.

## Blockers

None.
