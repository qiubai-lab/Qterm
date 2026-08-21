# Qterm UI Specification

## Contents

1. Product character
2. Foundations
3. Layout and scrolling
4. Component patterns
5. State and hierarchy
6. Motion
7. Accessibility
8. React and CSS implementation rules
9. Verification checklist

## 1. Product character

Qterm is a dense desktop workbench rather than a content website. Interfaces should feel precise, quiet, and operational:

- Keep the terminal or file content visually dominant.
- Use compact controls and small secondary labels to expose capability without competing with the work surface.
- Build depth with surface tone, border, and restrained shadow instead of large spacing or decorative gradients.
- Use mint as a functional signal. Most of the interface remains neutral gray.
- Preserve spatial continuity: tabs slide laterally, selection moves between blocks, and nested management opens above its parent.

When choosing between a visually impressive treatment and a clearer operational treatment, choose clarity.

## 2. Foundations

### Color roles

Use the existing root tokens in `src/app/app.css`:

| Role | Token / established value | Use |
| --- | --- | --- |
| App chrome | `--chrome: #151619` | title bar, utility rail |
| Canvas | `--canvas: #090a0c` | workspace background |
| Base surface | `--surface: #111316` | blocks and recessed panels |
| Raised surface | `--raised: #191b1f` | dialogs and editors |
| Hover | `--hover: #22252a` | neutral hover state |
| Border | `--border: #30343a` | structural boundaries |
| Subtle border | `--subtle: #23262b` | internal separators |
| Primary text | `--text: #f1f3f5` | titles and selected primary data |
| Secondary text | `--muted: #9da3ad` | labels and secondary copy |
| Tertiary text | `--dim: #747b86` | hints and metadata |
| Accent | `--accent: #75e6cf` | active/connected/primary |
| Accent surface | `--accent-bg: #153b35` | restrained active background |
| Danger | `--danger: #ff7b77` | destructive/error state |
| Keyboard focus | `--focus: #5fb3ff` | focus-visible only |

Do not create slightly different feature-local accent colors when an existing role fits. Add a token only when the color expresses a genuinely new semantic role used in multiple places.

### Typography

- Use the current UI stack: `Inter`, system UI, `SF Pro Text`, `Segoe UI`.
- Use `SFMono-Regular`, Consolas, or monospace for endpoints, paths, fingerprints, and terminal-adjacent metadata.
- Dialog title: about 15px, semibold, slightly negative tracking.
- Section/empty-state title: 13–14px.
- Primary item label: 9.5–11px, 600–700 weight.
- Form control text: 11px.
- Labels, hints, status, and toolbar copy: 8–10px.
- Body explanation: 9–11px with 1.45–1.65 line height.

Small text must remain secondary. Never use 8px text for required instructions or the only representation of a critical state.

### Shape and depth

- Dialog radius: 13px.
- Standard control/item radius: 5–7px.
- Informational card radius: 7–10px.
- Use one-pixel borders to define structure.
- Use strong shadow only for floating layers such as dialogs, menus, drag previews, and transient messages.
- Avoid stacking borders, shadows, and glow on the same ordinary element.

### Spacing

Use a compact rhythm based mainly on 3, 5, 7, 9, 12, 16, and 20px. Manager toolbars use about 7–9px padding; editor stages use about 20–22px; form gaps use about 11–13px. Large empty areas are acceptable only for intentional centered empty states.

## 3. Layout and scrolling

### Application shell

- Keep the top chrome fixed at 40px.
- Keep the utility rail fixed on the right; its label stays below the icon and remains visible.
- Reserve the remaining space with `minmax(0, 1fr)` and clip at the workspace boundary.

### Dialog sizing

- Standard dialog: `min(540px, calc(100vw - 48px))`.
- Wide/manager dialog: `min(790px, calc(100vw - 48px))`.
- Compact confirmation: about 390px with a 40px viewport gutter.
- Maximum height must keep at least a 24px gutter on every side.
- Header is fixed; content owns the remaining height with `display: flex; flex: 1; min-height: 0`.

### Manager dialog

Use this structure for connection, credential, profile, transfer, and similar CRUD management:

```text
DialogFrame
├── fixed header: title + subtitle + status + close
└── content grid
    ├── 210px sidebar
    │   ├── fixed creation/filter toolbar
    │   ├── independently scrolling compact list
    │   └── optional fixed destructive/global footer
    └── minmax(0, 1fr) editor
        ├── fixed local navigation/tabs when needed
        ├── independently scrolling stage
        └── fixed action footer
```

At narrower supported widths, reduce the sidebar to roughly 165–180px before changing the overall interaction model. Do not let the sidebar content push the dialog height.

### Scrolling contract

- Put `min-height: 0` on every shrinking flex/grid ancestor of a vertical scroller.
- Put `min-width: 0` on text-bearing grid/flex children.
- Give `overflow: auto` only to the list or editor stage that owns scrolling.
- Keep creation buttons, tabs, global status, and save/delete actions outside scrolling regions.
- Truncate one-line identifiers with ellipsis; wrap explanatory copy.
- Never solve nested-scroll bugs by adding arbitrary fixed heights to children.

## 4. Component patterns

### DialogFrame

Use the shared `DialogFrame` for modal surfaces. Provide a concise noun title and one-line subtitle. Put status pills in `headerActions`; keep close available at all times.

Nested dialogs must remain stacked. Only the topmost dialog handles Escape and Tab wrapping; closing it restores focus to the invoking control. Disable parent dismissal while a destructive confirmation or initialization dialog is active.

### Compact list items

- Connection-like item height: about 30px.
- Credential/item-with-icon height: about 38px.
- Primary name occupies the first line; endpoint, type, or algorithm is secondary.
- Use monospace for `user@host:port` and paths.
- Keep status/authorization information at the trailing edge when it aids scanning.
- Selected state uses a neutral raised background, brighter primary text, and at most one small accent indicator such as a dot.
- Avoid a wide or decorative left selection block. Do not make selection rely only on color.
- Dragging uses reduced opacity and a slight scale; drop targets get a restrained accent border/surface.

### Tabs and segmented controls

- Use a recessed track with a single moving indicator behind labels.
- Selected labels brighten and may gain a 4px accent dot.
- Keep labels stable; the indicator moves rather than replacing the entire tab background abruptly.
- Use correct `tablist`, `tab`, `aria-selected`, and `tabpanel` semantics.

### Forms

- Inputs/selects are normally 32px high with 6px radius and a one-pixel border.
- Label sits above the control; helper or validation text follows it.
- Prefix every required field label with the shared red `RequiredFieldLabel` star; use the vertically centered asterisk-operator glyph `∗` rather than the naturally superscripted ASCII `*`, and center it with the label text in the same line box. Do not append text such as “(required)” or “（必填）”. Hide the decorative star from assistive technology and add the native `required` attribute whenever the control supports it. Optional labels may use concise suffix text such as “（可选）”.
- Use a two-column grid only for naturally paired values such as host/port. Let names, credentials, passwords, and warnings span the editor width.
- Put a related secondary action such as “管理凭证” horizontally beside a flexible select using `minmax(0, 1fr) auto`.
- Use the common eye/eye-off icon for password visibility. Give it an accessible label that changes between show/hide.
- Never clear unsaved form state merely because a nested manager opens.

### Buttons

- Primary: filled accent, dark text; one dominant action per footer.
- Secondary: neutral raised surface and border.
- Danger: red outline by default; filled red only for final confirmation.
- Icon-only: about 25–28px square, persistent when core to the task, with `aria-label` and hover enhancement.
- Disable unavailable actions explicitly; do not hide them when their stable position helps comprehension.

### Status and feedback

- Use compact dot-plus-label pills for persistent status such as locked/unlocked or connected.
- Use an inline message or anchored transient panel for operation feedback; reserve dialog-wide alerts for blocking errors.
- Conditional validation and operation messages must not cause dialog geometry to shift. Preallocate a fixed-height status slot beside the related footer action, keep the full message available to assistive technology, and visually truncate unusually long text. If a blocking message genuinely needs multiple lines, design that stable region into the dialog's base layout instead of conditionally inserting it.
- Empty state combines one icon, a short title, one explanatory sentence, and at most three compact capability chips.
- Loading/busy labels use an ellipsis and disable the action that initiated the operation.

### Destructive operations

Separate delete/clear from save. Ask for confirmation in a compact nested dialog. State exactly what is deleted, what remains, and whether the action can be reversed. Put Cancel before the final filled danger action and autofocus the destructive confirmation only when that is intentional.

### Security-sensitive content

- Show credential names, types, algorithms, and encrypted/locked status.
- Do not display UUIDs, raw private keys, master passwords, or secrets in explanatory or list UI.
- Reveal a stored password only after an explicit eye-button action and allow it to return to masked state.
- Explain whether a value is stored, referenced, encrypted, or used only for the current connection.

## 5. State and hierarchy

Every interactive surface must deliberately specify:

- Rest, hover, active/pressed, focus-visible, selected, disabled.
- Empty, loading/busy, success, error.
- Locked/unlocked or connected/disconnected when the domain has those states.
- Dragging/drop-target where drag and drop exists.

Use neutral surfaces for hover, brighter text for selection, mint for confirmed active/secure state, yellow-brown callouts for caution, and red only for errors/destruction. Do not communicate critical state with color alone; pair color with text, icon, dot, or ARIA state.

## 6. Motion

Motion must explain where state came from:

- Hover/press feedback: 100–140ms.
- Selection and color transition: 120–180ms.
- Menu/dialog entrance: about 140–170ms.
- Tab indicator: about 240–260ms with `cubic-bezier(.2, .8, .2, 1)`.
- Tab/content slide: about 220–240ms; forward enters from +7–10px, backward from -7–10px.
- Active block indicator moving between panes: about 300ms using `cubic-bezier(.22, 1, .36, 1)`.

Animate only `transform`, `opacity`, color, border color, and shadow where practical. Avoid animating layout dimensions for routine transitions. Keep movement interruptible by deriving it from current state instead of queued timeouts.

Under `prefers-reduced-motion: reduce`, remove spatial movement and use a short fade or no animation. Under reduced transparency, remove backdrop blur/translucency. Preserve higher-contrast token overrides.

## 7. Accessibility

- Use semantic buttons rather than clickable generic containers.
- Give dialogs an accessible title, icon-only buttons labels, groups labels, and form controls explicit labels.
- Expose selected, pressed, expanded, checked, and disabled state through ARIA/native attributes.
- Keep a visible two-pixel `--focus` outline for keyboard focus.
- Trap focus inside the topmost modal and restore it when closing.
- Keep core actions discoverable without hover.
- Maintain text contrast at small sizes and avoid relying solely on accent glow.
- Ensure reduced-motion, reduced-transparency, and increased-contrast media queries remain effective.

## 8. React and CSS implementation rules

- Keep feature state and feature-specific markup in its domain component; keep `DialogFrame` and `Icon` generic.
- Prefer state-derived class names/data attributes over imperative DOM animation.
- Use stable keys to replay a short content entrance only when the semantic view changes.
- Keep destructive confirmation state separate from editor state.
- Preserve parent editor mounting while a child manager/confirmation is open.
- Reuse the existing `Icon` names and stroke style. Add an icon there only when no existing semantic icon fits.
- Reuse CSS variables and shared button/dialog classes. Name new classes by feature and role, not appearance.
- Avoid inline styles for stable design rules.
- Do not add a dependency for tabs, dialogs, motion, forms, or icons when the existing React/CSS primitives cover the behavior.

Canonical implementation references inside Terminal-Demo:

- `src/app/app.css`: tokens, manager layouts, tabs, motion, accessibility media queries.
- `src/components/dialogs/DialogFrame.tsx`: focus trap, modal stack, header structure.
- `src/components/dialogs/ConnectionDialog.tsx`: dense grouped list, editor tabs, nested credential manager.
- `src/components/dialogs/CredentialDialog.tsx`: fixed-toolbar list/detail manager layout.
- `src/components/dialogs/ConnectionAuthDialog.tsx`: segmented method switch and directional content motion.
- `src/components/Icon.tsx`: icon vocabulary.

## 9. Verification checklist

### Behavior

- Core actions work with pointer and keyboard.
- Parent drafts survive nested dialogs.
- Escape closes only the topmost dialog.
- Destructive actions require confirmation.
- Sensitive content remains masked and excluded from ordinary UI state.

### Layout

- Check empty, one-item, and long-list states.
- Check long names, paths, endpoints, translations, and validation copy.
- Check both normal and shortest supported window height.
- Confirm only the assigned list/editor region scrolls.
- Confirm fixed headers/toolbars/footers remain visible.
- Trigger validation and operation failures and confirm the dialog's width, height, and action positions remain unchanged.

### Visual

- Verify hierarchy beside connection and credential management.
- Confirm accent is sparse and semantic.
- Confirm selected state remains clear without hover.
- Confirm icons and labels align and no core icon is hover-only.
- Confirm tab indicator and content direction agree.

### Automated

- Add Testing Library coverage for state transitions and nested modal behavior.
- Add style assertions for layout contracts that previously regressed, especially `flex: 1`, `min-height: 0`, scrolling ownership, persistent action visibility, and reduced motion.
- Run focused tests during development.
- Run `pnpm check` before completion for meaningful frontend changes.
