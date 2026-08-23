# Light Typography and Active Block Emphasis Plan

## Requirement

Reduce excessive black-on-white contrast in the Light preset and strengthen active internal-window emphasis through theme-controlled roles.

## Scope

Includes Light semantic foreground tuning, active-pane outline/ring/shadow/header tokens, consuming those tokens in workspace chrome, and regression tests. Excludes layout, typography sizing, and Dark visual redesign.

## Affected Files

- `src/app/styles/themes/light.css`
- `src/app/styles/themes/dark.css`
- `src/terminal/terminalChrome.css`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`

## Design

- Use deep neutral gray-green values rather than near-black for Light primary text.
- Preserve hierarchy through separate strong, primary, muted, dim, and disabled roles.
- Keep selection restrained but redundant: stronger outline, a controlled ring/glow, and a more distinct active header surface.
- Theme presets own concrete active ring and glow values; terminal chrome only consumes semantic roles.

## Acceptance To Verification

- Text remains readable but less harsh: automated minimum and maximum contrast bounds.
- Hierarchy remains ordered: token luminance/contrast assertions.
- Active pane is theme-controlled: style assertions prohibit fixed mint colors in active pane rules.
- Existing behavior remains intact: focused workspace/style tests and `pnpm check`.

## Test / Verification

- `pnpm vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts src/workspace/LayoutView.test.tsx`
- `pnpm check`
- `git diff --check`

## Documentation Updates

- This task spec and plan capture the token and selection contract.
- Project context and Directory Map do not require changes.
