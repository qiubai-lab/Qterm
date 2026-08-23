# Light Workspace Selection Shadow Continuity Plan

## Requirement

Eliminate Light-theme shadow seams at the selected workspace tab and active pane without weakening selection recognition or altering the Dark preset.

## Scope

Includes theme shadow recipes, workspace-tab selected/hover layering, active-pane shadow ownership, and regression contracts. Excludes geometry, workspace behavior, and Dark visual redesign.

## Affected Files

- `src/app/styles/themes/dark.css`
- `src/app/styles/themes/light.css`
- `src/app/styles/themes/lightOverrides.css`
- `src/app/styles/shell.css`
- `src/terminal/terminalChrome.css`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`
- `src/workspace/WorkspaceShell.test.tsx`

## Design

- Add `--workspace-tab-active-border`, `--workspace-tab-active-background`, and `--workspace-tab-active-shadow`.
- Add `--block-active-surface-shadow` and `--block-active-indicator-shadow`, composed from existing active-pane color roles.
- Keep Dark composite recipes equivalent to current hard-coded declarations.
- Give Light tabs a one-pixel structural border, neutral raised gradient, and short shadow that fits inside the available clearance.
- Give Light panes inset/ring emphasis without the 14–18px external glow that is clipped by the canvas.
- Keep the actual selected tab transparent above its moving indicator and use the workspace icon as the small accent cue.

## Acceptance To Verification

- Both presets define all five recipes: theme token contract tests.
- Shell and terminal chrome consume only recipe variables: style assertions.
- Light recipes exclude broad pane glow and the former `#0003` tab shadow: explicit regression assertions.
- Selected/hover state does not cover the moving indicator: Light override selector assertions.
- Existing workspace selection and indicator movement remain functional: focused component tests.

## Test / Verification

- `pnpm vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts src/workspace/WorkspaceShell.test.tsx src/workspace/LayoutView.test.tsx`
- `pnpm lint`
- `pnpm vitest run --maxWorkers=1`
- `pnpm build`
- `git diff --check`
- Inspect changed selection rules for broad fixed-color Light shadows.

## Documentation Updates

- This task spec and plan record the theme-owned shadow contract.
- Project Context and Directory Map do not require updates.
