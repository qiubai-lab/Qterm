---
id: QB-20260820-persist-window-size
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

Qterm remembers the main desktop window size selected by the user and restores it on the next launch instead of always starting at 1040 x 720.

## Scope

- Persist the main window's normal size when the desktop application exits.
- Persist whether the main window was maximized so a maximized window reopens maximized.
- Restore the saved state on the next desktop launch.
- Keep the configured 1040 x 720 size and existing minimum dimensions as the fallback when no valid saved state exists.

## Constraints

- Use a cross-platform Tauri 2 desktop capability.
- Keep window lifecycle persistence outside the security/application settings domain.
- Do not change browser-only development behavior or the existing window controls.
- Preserve the user's unrelated worktree changes.

## Non-Goals

- Remembering window position, fullscreen state, visibility, or decorations.
- Adding a settings control for enabling or resetting window state.
- Changing the minimum supported window size.

## Acceptance

1. After resizing and closing Qterm normally, the next desktop launch restores that size.
2. After closing Qterm maximized, the next desktop launch restores the maximized state.
3. A first launch or unusable saved state falls back to the configured 1040 x 720 window and still respects 720 x 520 minimum dimensions.
4. Browser-mode window controls and existing desktop functionality remain unchanged.

## Acceptance To Verification

- Acceptance 1-2: verify the Tauri window-state plugin is registered with only size and maximized flags; perform a focused desktop smoke check when a GUI session is available.
- Acceptance 3: validate `tauri.conf.json` retains the default and minimum dimensions and run Rust checks for plugin integration.
- Acceptance 4: run the existing frontend window adapter test and the project quality checks.

## Open Questions

None.

## Regression Cause

The first implementation dynamically registered the plugin from the application `setup` callback. The configured main window had already passed the plugin's window-ready hook, so it was never inserted into the plugin cache. The resulting `.window-state.json` contained `{}` and there was no state to restore. The plugin must be attached to `tauri::Builder` before managed windows are created.

## Recommended Approach

Register the official `tauri-plugin-window-state` plugin statically on `tauri::Builder` in the Rust composition root with `SIZE | MAXIMIZED`. Static registration ensures the plugin observes the main window's ready event. The plugin owns lifecycle-safe persistence and cross-platform restoration while Qterm's static Tauri window configuration remains the fallback. A custom frontend resize listener plus local storage was rejected because it duplicates native DPI, maximize, shutdown, and multi-platform handling.

## Next Skills

- `writing-qb-plans`: Standard plan for dependency, composition-root, lockfile, documentation, and verification changes.
- `checking-architecture-boundaries`: keep native window persistence in the Tauri composition/infrastructure boundary.
- `protecting-critical-behavior`: add a focused contract test for the selected persisted flags.
- `verifying-before-completion`: run frontend and Rust quality gates.
- Directory Map: not needed; no directory, module ownership, or entrypoint responsibility changes.
