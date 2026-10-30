---
schema: 1
id: QB-20261031-cef-windows-block
type: feature
tier: strict
status: archived
created: 2026-10-31
updated: 2026-10-31
supersedes: []
---
# Windows CEF Browser Block

Authorization: user requested completing Windows Browser Block adaptation after explicitly authorizing Auto only for Windows debug builds. Preserve that policy; production sandbox/bootstrap support is outside this change.

## Behavior Delta
### MODIFIED
- REQ-001: Windows exposes local and SSH Browser Blocks instead of reporting unsupported, using the existing CEF contexts, gateway and trusted IPC boundary.
- REQ-002: Windows root and adopted popup pages follow logical bounds/DPI, selected visibility, rounded frame/panel overlays, occlusion and input blocking instead of returning unsupported surface errors. Hidden or blocked pages relinquish focus.
- REQ-003: User-initiated native popups become sibling child HWNDs in the same application window and existing Block tabs, preserving POST, opener, context and nested teardown; automatic popups and privileged navigation remain denied.
### ADDED
- REQ-004: Trusted native focus/pointer and Ctrl+W events route to the existing main-UI handlers without guest IPC authority. Native hooks and overlays end with their HWNDs; resizing/covering never clips the main UI or leaves a clickable hidden guest.

## Acceptance
- AC-001 [REQ-001]: Real Windows test app exposes capabilities, loads a local HTTP page and preserves guest IPC/internal-origin denial; existing context/gateway tests pass.
- AC-002 [REQ-002, REQ-004]: Native Windows checks exercise nonzero/fractional-DPI bounds, overlapping clipping holes, covered/hidden input rejection, focus return and recovery, overlays and native destruction.
- AC-003 [REQ-003]: Real CEF popup POST/opener/nested tabs share the root top-level HWND, preserve context, and close without closing the main application or unrelated pages.
- AC-004 [REQ-004]: Native trusted input emits existing focus/close-tab events, suppresses repeat Ctrl+W and leaves modified shortcuts/blocked guests untouched; hooks are released on final native close.

## Boundaries and risks
`web_cef/windows/` owns Win32 surface and input adapters; shared page/lifecycle/context ownership and frontend DTOs remain unchanged. Existing Windows bitmap raster/overlay code is reused through its module path. Runtime patches remain checksum-pinned tracked inputs, never edits to Cargo registry. New cohesive modules target <=300 lines; existing baselined files do not grow. No user profile migration or data removal. Tests use isolated directories and a compile-time parent harness.

## Review
PASS WITH NOTES: REQ/AC coverage is closed. Native Windows execution is required before claiming parity; a successful compile alone is insufficient. The existing debug-only unsandboxed exception is retained, and release startup remains independently blocked by the upstream sandbox broker limitation. Review performed against current source, Directory Map and engineering/UI specifications.

## Verification
AC-001 through AC-004 are covered by VER-001 through VER-004 in the plan and the Windows evidence: 25/25 real CEF checks, 3/3 native Win32 tests and real native typing/Ctrl+W. Broader macOS migration acceptance remains in QB-20261030-qterm-cef and is not archived by this change. Full-repository platform failures outside this delta (ConPTY clear-sequence expectation, macOS Node path/symlink fixtures, pre-existing CRLF) are recorded explicitly; no claim that every repository gate passed. Evidence: `scripts/cef/evidence/windows-block-2026-10-31.md` and adjacent JSON.
