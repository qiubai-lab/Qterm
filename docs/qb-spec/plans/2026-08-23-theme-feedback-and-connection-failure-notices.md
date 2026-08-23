# Theme Feedback and Connection Failure Notices Plan

## Requirement

Correct remaining Light-theme contrast/surface mismatches and unify connection failures on the existing lower-right workbench notice pattern.

## Scope

Includes connection-list text hierarchy, update-state icon rules, credential guidance styling, shared failure-notice styling and semantics, and removal of duplicate file-connection error rendering. Excludes backend error mapping and unrelated operation feedback.

## Affected Files

- `src/components/dialogs/connectionDialog.css`
- `src/components/dialogs/aboutUpdate.css`
- `src/components/dialogs/aboutUpdateStyles.test.ts`
- `src/components/dialogs/credentialDialog.css`
- `src/app/styles/themes/light.css`
- `src/app/styles/notices.css`
- `src/terminal/terminalSurface.css`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`

## Design

- Use `--muted` for resting connection names, promoting them to `--text` on hover and `--text-strong` when selected.
- Match update-state selector specificity in the semantic override section so legacy Dark literals cannot win the cascade.
- Use `--panel-bg`, `--border`, `--accent`, and `--muted` for credential guidance.
- Keep connection lifecycle notices in `LayoutView`; render the same accessible `BlockNotice` for terminal, files, and network leaves.
- Keep content-operation errors inside `FileBrowserPane`.
- Move the block-notice palette into the shared notices stylesheet and derive it from semantic danger/surface/shadow roles.

## Acceptance To Verification

- Visual roles are semantic and theme-neutral: CSS assertions.
- File connection failure renders exactly once at the block boundary: Testing Library assertion.
- File content errors retain inline behavior: existing and updated `FileBrowserPane` tests.
- Notice semantics expose an alert: Testing Library assertions for `role="alert"` and `aria-live`.

## Test / Verification

- `pnpm vitest run src/workspace/LayoutView.test.tsx src/files/FileBrowserPane.test.tsx src/components/dialogs/aboutUpdateStyles.test.ts src/app/themeStyles.test.ts src/app/appStyles.test.ts`
- `pnpm check`
- `git diff --check`
- Audit changed selectors for fixed Dark-palette foreground/background literals.

## Documentation Updates

- This task spec and plan record the feedback ownership and theme contract.
- Project Context and Directory Map do not require updates.
