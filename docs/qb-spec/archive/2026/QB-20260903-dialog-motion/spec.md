---
id: QB-20260903-dialog-motion
type: design
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Unified dialog motion

## Goal

Make Qterm dialogs arrive and dismiss with a consistent, restrained spatial transition, including the Git change preview, while preserving current dialog behavior and accessibility.

## Scope

- Shared `DialogFrame` entrance and scrim motion used by application modals.
- Symmetric exit motion for the Git change preview and existing Git dialogs that already retain themselves during dismissal.
- Audit of custom `role="dialog"` popovers to confirm they already have an entrance transition or add one where absent.
- Automated behavior and style coverage, including reduced motion.

## Non-goals

- Native operating-system file/folder dialogs.
- Menus, tooltips, transient status bubbles, or a redesign of dialog content/layout.
- Changes to save, delete, Git, SSH, persistence, or IPC behavior.

## Assumptions and constraints

- Existing `DialogFrame` focus trapping, topmost Escape handling, focus restoration, modal stacking, and blocking behavior remain unchanged.
- Motion follows the Qterm UI specification: 140–170ms entrance, compositor-friendly opacity/transform, no bounce, and no spatial movement under reduced-motion preference.
- Custom anchored popovers retain their source-oriented animation rather than adopting centered modal motion.

## Requirements

- REQ-001: Every `DialogFrame` modal must visibly enter through one shared short opacity-and-transform animation, with its scrim fading in.
- REQ-002: The Git change preview must remain mounted long enough to play a symmetric exit animation for close-button, Escape, and scrim dismissal.
- REQ-003: Existing Git repository picker and conflict resolver exit behavior must remain consistent with the shared motion language and must not permit duplicate completion while closing.
- REQ-004: Reduced-motion preference must remove spatial dialog motion and complete dismissals without an artificial wait.
- REQ-005: Every custom in-app element exposed as `role="dialog"` must have an appropriate entrance animation; anchored popovers may retain their existing source-oriented motion.

## Acceptance

- AC-001 [REQ-001]: Opening any shared Qterm modal applies the shared 160ms spatial entrance and scrim fade.
- AC-002 [REQ-002]: Closing “预览 Git 更改” applies closing state, delays `onClose` by 130ms, then invokes it exactly once.
- AC-003 [REQ-003]: Repository picker and conflict resolver retain their tested exit behavior after motion consolidation.
- AC-004 [REQ-004]: With `prefers-reduced-motion: reduce`, the Git change preview calls `onClose` immediately and shared modal CSS removes transform animation.
- AC-005 [REQ-005]: A source audit accounts for all production `role="dialog"` surfaces and focused style tests protect shared and custom entrance coverage.

## Behavior Delta

### ADDED

- REQ-001: Shared Qterm modals now use a visible spatial entrance with a coordinated scrim fade.
- REQ-002: Git change preview now has a symmetric animated dismissal.

### MODIFIED

- REQ-003: Existing Git modal-specific motion is aligned with the shared motion contract without changing completion semantics.
- REQ-004: Reduced-motion users receive immediate, non-spatial dismissal behavior.
- REQ-005: Custom dialog-like popovers are explicitly audited and protected for entrance motion.

## Quality check

- Requirements and acceptance criteria are closed and measurable.
- Existing focus, modal stack, business operations, and native dialogs are explicit invariants/non-goals.
- No unresolved product or security ambiguity blocked implementation.

## Verification evidence

- AC-001 and AC-005: shared/custom dialog style contracts and production `role="dialog"` inventory passed.
- AC-002 and AC-004: Git change preview close timing and reduced-motion behavior tests passed.
- AC-003: repository picker, conflict resolver, and Git Pane integration tests passed.
- `pnpm check:source-size`: passed with 0 ratchet reminders.
- Focused verification: 8 files, 132 tests passed.
- `pnpm check`: ESLint, 95 Vitest files / 819 tests, 13 Node tests, TypeScript, and Vite production build passed.

## Residual risk

- No live desktop recording was captured; timing and lifecycle are covered by component and style contracts.

## Blockers

None.
