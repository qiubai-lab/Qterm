# Button State Contrast and Feature Tags Plan

## Requirement

Fix low-contrast Light-theme buttons during dynamic content transitions and unify experimental-feature tags across the application.

## Scope

Includes shared Button/IconButton busy semantics, a compact shared warning tag, the three reported surfaces, and adjacent loading/disabled states found by audit. Excludes layout redesign and unrelated domain-specific cards.

## Affected Files

- `src/components/Button.tsx`
- `src/components/button.css`
- `src/components/Button.test.tsx`
- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/aboutUpdate.css`
- `src/components/dialogs/ConnectionAuthDialog.tsx`
- `src/components/dialogs/connectionDialogFeedback.css`
- `src/components/dialogs/ConnectionDialog.tsx`
- `src/network/NetworkAccessDialog.tsx`
- `src/network/network.css`
- `src/files/FileBrowserPane.tsx`
- `src/app/themeStyles.test.ts`

## Design

- Treat `aria-busy="true"` as an active operation, not an unavailable state: preserve opacity and tone while keeping the native disabled behavior.
- Let IconButton accept the same `loading` contract as Button.
- Extend StatusBadge with compact tag presentation without a status dot; use warning tone for experimental features.
- Keep update/network dimensions feature-owned while shared primitives own color, focus, disabled, and busy semantics.

## Acceptance To Verification

- Busy versus unavailable contrast: shared component tests and button CSS contract.
- Unified experimental labels: component assertions and absence of legacy experimental classes in migrated JSX.
- Reported screens: theme CSS assertions for auth, update, and network access surfaces.
- No regressions: focused Vitest set followed by `pnpm check`.

## Test / Verification

- `pnpm vitest run src/components/Button.test.tsx src/app/themeStyles.test.ts src/network/NetworkAccessDialog.test.tsx src/components/dialogs/ConnectionAuthDialog.test.tsx src/files/FileBrowserPane.test.tsx`
- `pnpm check`
- `git diff --check`

## Documentation Updates

- This task spec and plan document the reusable state and tag contract.
- Project context and Directory Map do not require changes.
