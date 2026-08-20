## Requirement

Remember the user's last Qterm desktop window size, including maximized state, and restore it on the next launch while retaining current defaults as fallback.

## Scope

Add the official desktop-only Tauri window-state dependency, register it with the intentionally narrow state flags, update the lockfile, and protect the flag selection with a focused Rust test. Do not add frontend state, settings UI, or position persistence.

## Affected Files

- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json` (verification only; defaults remain unchanged)
- `docs/qb-spec/specs/2026-08-20-persist-window-size.md`
- `docs/qb-spec/plans/2026-08-20-persist-window-size.md`

## Design

Treat window geometry as native desktop lifecycle state. Register `tauri-plugin-window-state` statically on `tauri::Builder`, before the configured main window reaches its window-ready event, and configure it to persist only `SIZE` and `MAXIMIZED`. Leave the existing Tauri window dimensions and minimum dimensions as the no-state/error fallback. Dynamic registration inside `setup` is explicitly excluded because it produced an empty cache and `{}` state file.

## Acceptance To Verification

- Resized window restores: plugin registration compiles and its flag contract test includes `SIZE`.
- Maximized window restores: flag contract test includes `MAXIMIZED`.
- Defaults remain safe: inspect the unchanged 1040 x 720 and 720 x 520 values, then run Cargo checks.
- Existing behavior remains stable: run the focused frontend window test, `pnpm check`, Rust formatting, Clippy, and tests.

## Test / Verification

1. Run the focused Rust test for persisted state flags.
2. Run `pnpm test -- src/lib/tauri/window.test.ts`.
3. Run `pnpm check`.
4. From `src-tauri`, run `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test --all-targets --all-features`.
5. If a desktop GUI session is available, resize, close, relaunch, and repeat for maximized state; otherwise report that manual lifecycle check as residual verification.
6. Confirm `.window-state.json` contains a `main` entry after close and that a second launch reports the saved physical dimensions.

## Documentation Updates

The task spec and plan capture behavior and rationale. Long-lived project context and the Directory Map do not need changes because no product domain rule or module ownership changes.
