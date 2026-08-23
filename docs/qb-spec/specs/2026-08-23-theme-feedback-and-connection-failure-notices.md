# Theme Feedback and Connection Failure Notices

## Goal

Make connection management, update status, credential guidance, and connection-failure feedback visually coherent in both presets, with connection failures shown once in the owning workbench pane's lower-right notice.

## Scope

- Soften unselected connection names while preserving selected and hover emphasis.
- Move update status icon state colors fully onto semantic theme roles.
- Move the credential detail guidance card onto semantic surface, border, icon, and text roles.
- Show file-connection failures through the same lower-right block notice used by terminal and network blocks.
- Make block and global failure notices consume theme roles and expose alert semantics.
- Keep ordinary file-listing and file-operation errors within their related file content or dialog.

## Constraints

- Workspace connection state remains owned by `WorkspaceProvider` and rendered by `LayoutView`.
- `FileBrowserPane` must not independently duplicate a connection failure already present in `FileRuntime.notice`.
- Dark and Light presets must share the same semantic CSS contract.
- Connection failures remain visible until the runtime clears its notice; this task does not introduce a notification queue or timeout policy.

## Non-Goals

- Changing SSH error wording or backend error mapping.
- Moving ordinary directory-read, preview, transfer, or form-validation errors into workbench notices.
- Introducing a global toast dependency or redesigning all operation feedback.

## Acceptance

- Unselected connection names use a calmer secondary text role; selected names remain visually strongest.
- Latest, available, checking, and error update icons have theme-appropriate surfaces and borders.
- The credential deletion guidance card has no Dark-only color literals in its effective rule.
- A failed files connection produces one lower-right block alert and no inline connection error strip.
- Terminal, files, network, and global failure notices use semantic danger/surface/shadow roles in both themes.
- Existing non-connection file errors continue appearing at their related content surface.

## Acceptance To Verification

- Theme-role ownership and selector specificity: style contract tests in `src/app/themeStyles.test.ts` and `src/components/dialogs/aboutUpdateStyles.test.ts`.
- Single file-connection failure presentation: `src/workspace/LayoutView.test.tsx` and `src/files/FileBrowserPane.test.tsx`.
- Existing file error behavior: focused `FileBrowserPane` tests.
- Frontend integrity: focused Vitest followed by `pnpm check`.

## Open Questions

None.

## Recommended Approach

Keep connection failure ownership at the workbench block boundary and reuse the existing block notice. This avoids duplicate messages and preserves the distinction between connection lifecycle failures and content-operation failures. Per-theme component overrides or a new toast subsystem would add more specificity and state ownership than this correction needs.

## Next Skills

- `qterm-interface-design`: visual hierarchy and feedback placement.
- `writing-qb-plans`: Standard plan because behavior and several style consumers change.
- `checking-architecture-boundaries`: keep runtime notices at the workspace boundary and content errors in the file feature.
- `protecting-critical-behavior`: regression coverage for duplicate failure presentation.
- `verifying-before-completion`: focused and full frontend checks.
- Project Context: not needed; this is a scoped UI correction.
- Directory Map: not needed; no module or entrypoint moves.
