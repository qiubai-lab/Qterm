---
name: qterm-interface-design
description: Design, implement, or review Qterm desktop frontend interfaces using the project's compact dark workbench visual language, manager-dialog layouts, interaction states, motion, accessibility, and React/CSS conventions. Use for new Qterm pages, dialogs, sidebars, lists, forms, tabs, tool rails, terminal/file surfaces, UI refactors, visual consistency fixes, responsive overflow bugs, or animation and polish work in the Terminal-Demo frontend.
---

# Qterm Interface Design

Use the existing product as the design system. Preserve its dense desktop-tool character: dark layered surfaces, compact information hierarchy, restrained mint emphasis, persistent controls, and short spatial motion.

## Required reference

Read [references/qterm-ui-spec.md](references/qterm-ui-spec.md) completely before making UI decisions. Treat it as the normative specification for visual hierarchy, layout, components, motion, accessibility, and verification.

## Workflow

1. Inspect the target component, adjacent tests, `src/app/app.css`, `src/components/Icon.tsx`, and the closest established screen. Reuse existing primitives and state patterns before adding classes.
2. Classify the surface:
   - Use a manager dialog for list-and-detail CRUD workflows.
   - Use a compact dialog for confirmation or a single decision.
   - Use segmented tabs for two to three peer modes.
   - Use the utility rail only for global tools.
   - Keep terminal and file controls in their block headers.
3. Define the information hierarchy before styling: primary task, selected object, secondary metadata, status, and destructive actions.
4. Make scrolling ownership explicit. Every nested flex/grid region that may shrink needs `min-width: 0` or `min-height: 0`; only the intended list/editor region may scroll.
5. Implement all observable states: empty, loading or busy, selected, disabled, error, success, locked, and confirmation where applicable.
6. Add motion only when it explains a spatial or state transition. Animate `transform` and `opacity`, keep transitions short, and provide reduced-motion behavior.
7. Preserve semantics and keyboard behavior: labels, roles, selected/expanded state, focus-visible treatment, focus restoration, and topmost-dialog Escape handling. Required form labels use the shared red `RequiredFieldLabel` star before the label text, never a textual “（必填）” suffix; pair it with native `required` semantics where supported.
8. Route native file and folder dialogs through `src-tauri/src/commands/native_dialog.rs`. Never call `blocking_pick_*` or `blocking_save_*` from a Tauri command: synchronous commands run on the event thread and can deadlock macOS `NSOpenPanel`. Keep the invoking command asynchronous, await the callback bridge, and audit with `rg 'blocking_(pick|save)' src-tauri/src/commands`.
9. Add or update adjacent behavior tests and style assertions. Run focused checks, then `pnpm check` for meaningful frontend changes.

## Design decisions

- Prefer density over decorative whitespace, but never compress controls below reliable pointer and keyboard targets.
- Show important controls persistently. Hover may enhance them; it must not be the only way to discover core actions.
- Indicate selection with surface, text, and a small semantic indicator. Avoid oversized accent fills, thick rails, or glow as decoration.
- For single-selection list/detail managers, use one theme-aware moving selection surface behind the rows and the directional detail-stage pattern in the UI specification. Retarget the surface immediately; never draw a second selected frame on the destination row while it moves.
- Treat the file browser row interaction in `src/files/fileBrowser.css` as canonical for dense file/path selection, including Git change lists: reuse its theme-aware active and selection tokens, full inset selection outline, foreground roles, and selected-over-hover precedence.
- Use accent color for active state, connection/security status, focus, and primary actions—not for ordinary body copy.
- Style an explicit Cancel action paired with a positive primary footer action as a theme-aware negative action: use the shared `Button` with `variant="danger"`, never a hard-coded red. Keep filled danger styling for irreversible confirmation actions only.
- Keep destructive actions separated from the primary path and require confirmation for irreversible operations.
- Do not expose secrets, UUIDs, or implementation-oriented identifiers as primary UI content.
- Do not introduce a new UI library, icon family, font, global token system, or animation dependency unless the user explicitly requests it.

## Reuse hierarchy

Prefer, in order:

1. Existing component and class unchanged.
2. Small extension of an established component.
3. A feature-local component following the same structure.
4. A new shared primitive only after two concrete consumers demonstrate the same behavior.

Avoid a generic “universal panel/dialog/form” abstraction that erases feature semantics.

## Completion gate

Before reporting completion, confirm:

- The new surface belongs visually beside connection and credential management.
- Long content scrolls only inside its assigned region.
- Primary, secondary, selected, disabled, error, empty, and destructive states remain legible.
- Core icons/actions are visible without hover.
- Keyboard focus and nested dialogs behave correctly.
- Native file dialogs use the non-blocking command bridge; selecting and cancelling remain responsive on macOS.
- Reduced motion and constrained window sizes remain usable.
- Conditional validation and operation feedback uses a preallocated slot and never changes dialog dimensions when it appears or disappears.
- Tests and `pnpm check` pass, or any blocked verification is reported explicitly.
