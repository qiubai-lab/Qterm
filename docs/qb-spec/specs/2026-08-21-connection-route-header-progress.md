## Goal

Keep the actual SSH route visible in terminal, file, and network block headers without duplicating status text or covering content, while retaining the connected endpoint when space permits.

## Scope

- Represent only real SSH hosts: direct connections have one target node; each jump adds one node.
- Keep the node chain visible after connection succeeds.
- Place the node chain immediately after the connection name, replacing the menu-square and textual `connecting` position.
- Show `user@host` after the node chain only when connected.
- Expose node details only through hover and keyboard focus; do not automatically open or click-pin a tooltip.
- Preserve failed-node state for inspection while the existing block notice carries the blocking error.
- Under constrained width, hide the connected endpoint before compacting any primary route status.

## Constraints

- Keep the 29px header height and right-side actions stable.
- Keep the connection name as the target-picker trigger after removing its trailing menu glyph.
- Do not change the Tauri session event contract or SSH behavior.
- Use existing colors and focus treatment; hover-only details must have a keyboard-focus equivalent.
- Preserve unrelated workspace changes.

## Non-Goals

- Persisting route diagnostics across launches.
- Changing connection selection behavior.
- Adding a tooltip dependency.
- Redesigning block actions or error notices.

## Acceptance

1. A direct SSH connection renders one target node; one jump renders jump and target nodes; N jumps render N+1 nodes.
2. Connecting, completed, pending, and failed states remain semantically distinguishable.
3. Successful route nodes remain visible for the lifetime of the connected block.
4. No node tooltip appears automatically and clicking a node does not pin one; hover and keyboard focus expose exactly one node detail.
5. The target picker no longer renders the trailing menu square or duplicate textual connection state while route progress exists.
6. After connection succeeds, the header order is connection name, route nodes, then `user@host` (or the established network endpoint form).
7. At constrained width the connected endpoint is hidden first; route nodes, connection name, and block actions remain visible.
8. Terminal, file, and network blocks share the behavior, including reduced-motion and accessible labels.

## Acceptance To Verification

- Acceptance 1-3: focused route-state reducer tests.
- Acceptance 4: component hover/focus and persistence tests.
- Acceptance 5-7: workspace integration and CSS contract tests.
- Acceptance 8: focused tests followed by `pnpm check`.

## Open Questions

None blocking.

## Recommended Approach

Reuse the existing feature-local node chain, but remove the synthetic local node and transient display state. This is preferable to keeping aggregate text because the chain already communicates route progress, and preferable to hiding the chain because it remains useful connected-state context. Keep the endpoint as low-priority trailing metadata and collapse it first.

## Next Skills

- `writing-qb-plans`: Standard multi-file frontend plan.
- `protecting-critical-behavior`: protect node indexing, persistence, and disclosure behavior.
- `verifying-before-completion`: focused tests and `pnpm check`.
- Project Context: not needed; this is task-local UI behavior.
- Architecture boundaries: not needed; state remains in the existing workspace feature.
- Directory Map: not needed; no structural boundary changes.
