---
id: QB-20260823-button-state-contrast-and-feature-tags
status: archived
archived: 2026-09-02
legacy: true
---
# Button State Contrast and Feature Tags

## Goal

Keep button content readable in every preset while labels and icons change between idle, loading, success, and retry states, and present experimental-feature labels with one consistent visual semantic.

## Scope

- Define readable busy-state behavior for shared text and icon buttons.
- Add a compact tag presentation to the shared status badge primitive.
- Migrate update-check actions, network access copy actions, and all experimental-feature labels to shared primitives.
- Correct the authentication method indicator and SSH Agent recommendation surface in Light mode.
- Audit disabled controls whose content represents active detection or launch progress and keep those states readable.

## Constraints

- Dark remains the default preset and retains its current visual hierarchy.
- Concrete colors remain owned by theme tokens; components consume semantic roles.
- Busy buttons remain natively disabled and expose `aria-busy`.
- Disabled-unavailable controls may stay subdued; disabled-busy controls must not be faded as unavailable.

## Non-Goals

- Redesigning dialog layout or changing update/network behavior.
- Replacing every domain-specific selectable card with the shared Button component.
- Adding a new UI dependency or a third theme.

## Acceptance

- A shared button with `loading` remains fully legible and distinguishable from an unavailable disabled button.
- Dynamic update-check copy/retry/recheck actions use shared button contrast roles.
- Network address copy and detecting/launching browser states remain readable in Light mode.
- Experimental labels in connection jump tabs, network access headers, and file editing use the same warning tag treatment.
- Authentication tabs and the SSH Agent recommendation card contain no fixed Dark-only surface or text colors.

## Acceptance To Verification

- Shared button and tag semantics: `src/components/Button.test.tsx` plus style contract assertions.
- Feature migrations: adjacent Network Access, Connection Dialog, and File Browser tests.
- Theme ownership and contrast roles: `src/app/themeStyles.test.ts`.
- Integration integrity: `pnpm check`.

## Open Questions

None.

## Recommended Approach

Extend the existing shared button/status primitive with explicit busy-state and compact-tag contracts, then migrate the concrete callers. This avoids both feature-local color drift and a growing Light-only override sheet.

## Next Skills

- `writing-qb-plans`: Standard plan because the fix spans shared primitives and multiple features.
- `checking-architecture-boundaries`: keep state semantics in shared primitives and feature layout in feature modules.
- `protecting-critical-behavior`: add regression contracts for this repeated visual-state bug.
- `verifying-before-completion`: focused tests and `pnpm check`.
- Directory Map: not needed; no module or entrypoint boundary changes.
