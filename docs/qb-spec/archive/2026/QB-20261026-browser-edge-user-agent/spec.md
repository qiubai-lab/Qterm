---
schema: 1
id: QB-20261026-browser-edge-user-agent
type: feature
tier: standard
status: archived
created: 2026-10-26
updated: 2026-10-26
supersedes: []
---

# Edge browser identity

Authorization: user requests Edge UA consistently for browser Blocks.

## Scope and acceptance

- REQ-001: macOS browser guests expose a desktop macOS Edge compatibility UA through WKWebView.customUserAgent before their first navigation. Windows retains its native, runtime-versioned WebView2 Edge UA.
- REQ-002: Local, remote and native popup guests share the policy. Do not change the engine, networking, storage, webpage styles or synthesize Client Hints.
- AC-001 [REQ-001]: Real WebKit fixtures verify the HTTP request User-Agent equals navigator.userAgent and contains the desktop macOS, Chrome and Edg tokens.
- AC-002 [REQ-002]: The same checks pass on direct and SOCKS pages and on a native popup before and after adoption. Existing navigation and tunnel isolation checks pass.

## Behavior Delta

### MODIFIED

- REQ-001: macOS previously exposed WKWebView's default UA; it now identifies as desktop Edge. Edge major 156 matches the locally installed Edge 156.0.4314.42 at implementation time; this is a maintained compatibility identifier, not a WebKit engine version. Windows continues tracking the installed WebView2 runtime.

## Implementation

Owner: BrowserGuest initializer sets one private compatibility constant before navigation. Both Store and Popups already construct this owner. No new production module/dependency/configuration is necessary; growth under ten lines. Add behavioral assertions to the existing isolated native smoke fixture, with HTTP-header echo from its loopback/SOCKS server. Document the UA/version policy and WebKit limitation.

Embedded review: PASS; platform-specific OS/version fields are retained while the browser identity is Edge. Changing UA does not provide Chromium features or guarantee every authentication provider accepts embedded browsers.

## Verification plan

Run the new native assertion against the old implementation to establish failure, then rerun the navigation/network/store suite with the fix; run pnpm check, cargo build and diff whitespace checks. Windows runtime checks cannot execute on this macOS host; no Windows runtime behavior is changed.

## Verification

- AC-001: The new real-WebKit assertion failed against the old implementation with `remote exposes desktop Edge identity`. After the fix, both direct and SOCKS pages passed Edge identity and first-request HTTP header / navigator equality checks.
- AC-002: Both direct and SOCKS native popups passed those same checks before and after adoption. `python3 scripts/macos-web-smoke/fixture.py --navigation-only` passed, including routing, storage isolation, WebSocket, worker bypass blocking, 301/302 redirects and loop recovery. The final fixture revision was rerun successfully. Only isolated local fixtures were used; no real login provider was validated.
- `cargo build --manifest-path src-tauri/Cargo.toml` passed, compiling/linking the production Swift adapter. `pnpm check` passed source-size, ESLint, 240 Vitest files / 1396 tests (1 file / 2 tests skipped), 27 Node tests, TypeScript and Vite build. `git diff --check` passed.
- Windows retains its existing native UA path and was reviewed in source; Windows runtime execution is unavailable on this host. Documentation and Directory Map describe the policy and fixed macOS compatibility version. No dependencies, permissions, storage schema or packaging settings changed; no release bundle required.
