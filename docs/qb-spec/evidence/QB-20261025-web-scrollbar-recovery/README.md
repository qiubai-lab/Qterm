# Dynamic native scrollbar recovery

2026-10-25, Windows WebView2. User requested repair after a dynamic Baidu page showed platform scrollbars until refresh.

## Reproduction and implementation

Four new document-lifecycle regressions failed against the old script: removed/edited style nodes, replacement roots/heads, coalesced restoration and suspended-page recovery. The former test only called the installer manually after deletion, so it did not protect automatic repair.

The guest script now has one controller attached to its document through a symbol. Repeated host calls update that owner's CSS instead of installing competing observers. It observes document/root structure, head and its style node, coalesces repairs using requestAnimationFrame, and disconnects while making its own changes. Initial HTML is still styled before its first paint. Pagehide cancels pending work; pageshow restores the latest palette. Ordinary body subtree mutation is not observed, and no polling, forced overflow toggles, scrolling interception, page reload or application bridge was added.

This closes the confirmed lifecycle gap. It does not retroactively prove which exact DOM operation occurred in the user's original Baidu session, and does not claim to override arbitrary hostile CSSOM changes or iframe/shadow-root styles.

## Native evidence

The native smoke retains the real production opener configuration and uses an isolated local guest. It starts with a short page, appends enough body and nested content to overflow, then checks both actual gutters are 3 CSS pixels. It removes/edits the owned style, replaces head, changes media/type, and adds conflicting later CSS. The latest palette, hidden arrow buttons, original document marker and scrollY=180 must all survive, without host style sync or reload during repairs.

- [Dynamic viewport and nested scrollbars](dynamic-overflow.png)
- [After head/style replacement, same scroll position](recovered-head.png)

These captures are from the isolated native test window and were visually inspected, not from the full workbench. Existing IPC/proxy/popup/overlay checks remain in the smoke.

## Reproduction commands

```powershell
pnpm exec vitest run src/web/webScrollbarScript.test.ts src/web/webScrollbarTheme.test.ts --maxWorkers=2
cargo test --manifest-path src-tauri/Cargo.toml native_webview_smoke -- --ignored --nocapture --test-threads=1
```

Optional public-site search coverage: set `$env:QTERM_WEB_LIVE_SCROLLBARS='1'` before the native smoke, then remove that environment variable. Public-site markup and availability can affect this portion. The script is embedded by Rust; restart the rebuilt desktop binary to apply the change.

The live Baidu attempt did not verify a successful search transition. Earlier attempts rendered the initial results with the themed scrollbar but did not complete the subsequent search; the final attempt did not meet the page-readiness condition within 45 seconds. [Baidu diagnostic capture](baidu-search.png) shows only the initial results and is **not** passing transition evidence. The controlled native cases above passed independently; the exact reported Baidu interaction still needs confirmation in the user's rebuilt app.

## Final checks

- The new DOM tests first failed all four cases with the old script. After the repair, the two focused files pass all five tests, including final ID/move and hidden-page palette cases. Focused ESLint and Node syntax checking pass.
- `pnpm check` passed source-size and lint, then encountered five test failures/timeouts across four files under default concurrency. A complete rerun with `pnpm exec vitest run --maxWorkers=2` passed **231 files / 1363 tests**, with 1 file / 2 tests skipped. All 21 Node script tests and `pnpm build` (TypeScript + Vite) passed. Assertions and timeouts were not loosened.
- Rust full all-target/all-feature suite passed **361 tests**, with 7 ignored, in 148.70 seconds. The final changes after that run affect only the opt-in ignored live-site test driver.
- The final native `native_webview_smoke` run with the live-site option unset passed in **38.13 seconds**. It includes the dynamic scrollbar assertions and existing local/remote routing, guest IPC restrictions, popup links, storage and native overlay regressions.
- `cargo fmt --check` and `cargo clippy --all-targets --all-features -- -D warnings` passed after the final test-driver edits. Source-size checks have zero ratchet reminders; `git diff --check` passes.

Unrelated workspace/tab drag edits already present in the shared checkout are preserved. No dependencies, capabilities, persisted data formats or packaging changes; no release bundle or commit/push was performed.
