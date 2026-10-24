---
schema: 1
id: QB-20261025-web-title-rim
type: bugfix
tier: standard
status: archived
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# Native page titles and antialiased history edges

Authorization: fix host-only history/bookmark names, jagged recent-history corners and clipped more-history hover.

- REQ-001: Capture titles from native WebView2 navigation completion and DocumentTitleChanged, associate them with the current successfully loaded URL, and use them for history/bookmarks. Metadata updates must not create/reorder visits or cross profiles; missing titles retain usable fallbacks.
- REQ-002: Keep binary native occlusions inside opaque HTML while a mouse-transparent native alpha rim paints smooth corners using existing theme colors and the same reveal geometry.
- REQ-003: Keep more-history hover fully inside the dropdown, preserving keyboard selection and reveal/retract behavior.
- AC-001 [REQ-001]: Navigation-state tests cover loading/stale/failed/duplicate titles; domain tests cover normalized bounded UTF-8, persistence compatibility, existing bookmark correction and metadata ordering. Frontend tests cover current-title bookmarks and late guest events. Native smoke captures actual title events.
- AC-002 [REQ-002]: Raster tests cover partial/premultiplied alpha at six DPI scales; native smoke covers a panel-only overlay and cleanup; inspect actual Windows page with rounded history.
- AC-003 [REQ-003]: Style checks enforce inset hover bounds; existing keyboard/reveal tests remain passing; inspect actual hover.
- AC-004 [REQ-001, REQ-002, REQ-003]: Run frontend check and relevant Rust format/clippy/tests/native smoke, report unrelated failures accurately.

## Behavior Delta

### MODIFIED
- REQ-001: Native navigation owns title ordering; web-library domain owns bounded title updates; React transports current metadata and uses title when bookmarking. Existing saved records need no schema migration; titles are corrected on revisit.
- REQ-002: Add optional validated panel chrome to WebBounds. webSurfacePanels owns the shared reveal shape; surface_raster owns alpha rim composition, windows_frame retains native window ownership. Guest privileges, proxy/session lifecycle and persistence schema stay unchanged.
- REQ-003: The footer action has a 3px surrounding inset and a rounded inset hover outline.

## Plan

- [x] Implement bounded metadata flow and smooth native rim through existing owners.
- [x] Complete regression/native visual checks and archive evidence.

Growth budget: each new surface helper below 220 lines; no baselined hotspot growth or new dependency. Native changes are runtime code only, so no installer build is required. Update Directory Map for the new shape/raster owners. Existing Qterm UI/module standards apply; no new long-lived style preference.

## Evidence

- AC-001: Focused frontend suite passed 13 files / 48 tests. Focused all-feature Rust web tests passed 18 tests / 1 intentionally ignored native test. Native WebView2 smoke was then explicitly run and passed: initial title `Proxy A`, dynamic `DocumentTitleChanged` metadata, existing route/Stop/proxy/guest-permission behavior. Actual development app showed `Coding Plan 用量看板` and `A6000 AI API` in recent history instead of host. Existing bookmark correction is covered by domain persistence rules and current-title bookmarking by React tests.
- AC-002 / AC-003: Real native test passed the panel-only transparent non-activating layer, region/frame cleanup and guest destruction. Six-DPI raster tests prove premultiplied partial alpha and transparent interiors. Actual app on a light webpage showed smooth rounded edges and the fully inset more-history outline (keyboard selection uses the same inset surface; pointer hover was also observed while the user interacted). Screenshot: `docs/qb-spec/evidence/QB-20261025-web-title-rim/titles-rounded-hover-native.png`.
- AC-004: Final source-size check has zero reminders; ESLint, TypeScript/Vite build, all 21 Node script tests, `cargo fmt --check`, and `cargo clippy --all-targets --all-features -- -D warnings` passed. Clippy initially requested two collapsed conditionals, corrected with no behavioral change. Full frontend check had 195 files / 1210 tests passed, 1 file / 2 tests skipped, and 6 unrelated failures in 4 files (workspace tab overflow/deck, Git operations, connection dialog; timeouts and CodeMirror/jsdom range measurement). Scoped rerun of those four files plus the new shared-panel geometry test passed 5 files / 52 tests with `--maxWorkers=2`, without relaxing assertions.
- Full `cargo test --all-targets --all-features` result collected on 2026-10-25: 346 passed, 0 failed, 7 intentionally ignored; main and example targets also passed. Log: `%TEMP%/qterm-title-rust-all.log`.
- The user stopped Computer Use with physical Escape after native visual verification; no further UI calls were made. Development auto-recompilation restarted the dev window after the behavior-neutral Clippy fix; its last viewport/navigation state was not rechecked after that stop. Production app was untouched. No credentials, remote forms or repository commits were submitted. No installer build was needed.
- Directory Map updated for shape sampling and alpha compositing owners. No new long-term style preference was inferred.
