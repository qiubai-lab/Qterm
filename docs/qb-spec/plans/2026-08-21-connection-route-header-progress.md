## Requirement

Make the header node chain a persistent representation of actual SSH hosts, followed by connected endpoint metadata that collapses first under constrained width.

## Scope

Revise node indexing and failure state, remove transient/automatic tooltip behavior, integrate the connected endpoint after the route chain, remove duplicate target-picker chrome, and update responsive/test contracts. Backend events and SSH behavior remain unchanged.

## Affected Files

- `src/workspace/connectionProgress.ts`
- `src/workspace/connectionProgress.test.ts`
- `src/components/ConnectionRouteProgress.tsx`
- `src/components/ConnectionRouteProgress.test.tsx`
- `src/workspace/TerminalTargetPicker.tsx`
- `src/workspace/TerminalTargetPicker.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/LayoutView.test.tsx`
- `src/workspace/WorkspaceProvider.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

- Set total route nodes to `jumpCount + 1` and map event indices directly without a synthetic local offset.
- Extend node state with `failed`; keep progress on failures and mark the reported or active node.
- Remove the success timer, automatic tooltip, and click-pin state. Nodes are focusable status elements; hover/focus controls one tooltip.
- Remove the target-picker menu glyph. Suppress its inline detail when the route owns status.
- Render connected endpoint metadata inside the route component after the node chain.
- Replace the old container rule that hides route progress with one that hides endpoint metadata first; keep route nodes persistent.

## Acceptance To Verification

- Direct/one-jump/multi-jump counts and failure retention: `connectionProgress.test.ts` and workspace provider tests.
- Persistent success and hover/focus-only disclosure: `ConnectionRouteProgress.test.tsx`.
- Header order and target-picker chrome: `LayoutView.test.tsx` and `TerminalTargetPicker.test.tsx`.
- Endpoint-first width degradation: `appStyles.test.ts`.
- Integration integrity: `pnpm check`.

## Test / Verification

1. Run focused Vitest files for the reducer, route component, target picker, layout, workspace provider, and CSS contracts.
2. Run `pnpm check` after focused tests pass.
3. Run `git diff --check` and confirm unrelated Rust/credential changes remain untouched.

## Documentation Updates

Update this plan and paired task spec only. No project-context or Directory Map update is required.
