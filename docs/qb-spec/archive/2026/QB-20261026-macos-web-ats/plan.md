---
schema: 1
id: QB-20261026-macos-web-ats
type: bugfix
tier: strict
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Implementation and verification

Scope approved in the user's request; spec review passed before planning.

- TASK-001 [REQ-001, REQ-002, AC-001, AC-002]: Add regression coverage of production config linkage and both flavor plist ATS dictionaries. Add a non-reserved production plist input and the WebView-only exception to the existing development plist.
- TASK-002 [AC-001, AC-002]: Verify native ATS behavior with isolated temporary WKWebView app bundles and a local SOCKS fixture; verify configuration output and repository checks. Do not restart the user's active Qterm process.

Architecture gate: configuration ownership remains with Tauri bundling and the existing development runner; no application/module boundaries change. Critical behavior gate: protect exact ATS scope and flavor linkage before editing configuration, then exercise native behavior. Directory Map gate: no source module or runtime entry changes.

- VER-001 [AC-001, AC-002]: Run the focused Node Tauri tests before and after; parse plist dictionaries with macOS plutil and check exact exception scope.
- VER-002 [AC-001, AC-002]: Compare native WebView HTTP/307 behavior without and with the exception; verify URLSession still rejects HTTP and WebView rejects an untrusted TLS certificate.
- VER-003 [AC-001]: Attempt `pnpm tauri build --bundles app`; inspect produced app plist. If the pinned SDK is unavailable, record the limitation and verify bundler output separately without changing the release SDK policy.
- VER-004 [AC-001, AC-002]: Run `pnpm check` and inspect the final diff for unrelated navigation/proxy/certificate changes.

Rollback: revert the two plist inputs/config wiring and rebuild. No persistent data migration or live settings modification occurs.

## Evidence

- VER-001: The new regression test failed on the original configuration (production plist missing), then all 12 focused Node tests passed with Node 22.23.2. Both plist dictionaries contain exactly `NSAllowsArbitraryLoadsInWebContent: true`.
- VER-002: Passed on macOS using temporary signed Swift WKWebView app bundles with the actual development/release plist dictionaries, an isolated website store, and a localhost SOCKS5 fixture serving `ats-probe.invalid`. Baseline HTTP failed with -1022. Both updated flavors followed HTTP 307 from `/start` to `/ok` and loaded successfully. An HTTP 307 to HTTPS with a self-signed certificate failed with -1202 in both flavors. URLSession HTTP failed with -1022 in both flavors. Probe sources remain at `/tmp/qterm-ats-probe/` for this session; no external service or user session was used.
- VER-003: Full `pnpm tauri build --bundles app` was blocked by the existing SDK pin (26.5 required; only 27.0 available). No SDK policy was changed. As the change only affects bundling, `pnpm exec tauri bundle --bundles app` and `pnpm exec tauri bundle --debug --bundles app --config src-tauri/tauri.dev.conf.json` successfully packaged existing binaries. Both resulting bundle plists contain the exact exception and pass `codesign --verify --strict`. The already-running development watcher also regenerated its runner bundle with the new plist; its dictionary and signature were checked. These are configuration/bundling proofs, not a fresh release compilation. Full release compilation can be repeated with SDK 26.5 installed using `pnpm tauri build --bundles app`.
- VER-004: `pnpm check` passed with Node 22.23.2, including source-size, ESLint, Vitest, Node tests, TypeScript, and Vite build. `git diff --check` passed. No URL normalization, proxy, WebView navigation delegate, or certificate challenge code changed.

Acceptance: AC-001 and AC-002 pass with the native and bundle evidence above. The user's remote GitLab endpoint was not accessed; its server redirect behavior is separate from ATS compatibility. Changes require an app process launched from the updated bundle; HTTP is not proactively upgraded by this change.
