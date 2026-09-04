---
id: QB-20260904-conpty-resize
---

## Scope and design
REQ-001–003: a terminal layout controller owns measurement, settled Windows grid updates and output drain, delegating serialized transport to the existing resize scheduler. TerminalPanel wires the capability only; PTY, IPC and persistence contracts remain unchanged. Apply qterm-maintainable-modules and ENGINEERING_STYLE_SPEC: TerminalPanel must shrink, new controller/tests remain within source-size limits.

## Affected files
TerminalPanel.tsx, terminalLayout.ts and adjacent tests, resizeScheduler.ts/tests if required, source-size baseline and Directory Map; Windows native probe example and Node driver.

## Implementation tasks
- [x] Reproduce against real ConPTY and xterm before implementation.
- [x] Add failing regression protection for synchronized settled layout.
- [x] Implement and wire the capability without expanding TerminalPanel.
- [x] Run native probe and frontend checks; document timing/coverage limitations.

## Acceptance to verification
- AC-001: cargo build --example conpty_resize_probe; node scripts/conpty-resize-probe.mjs; compare original and fixed scheduling with delayed native output.
- AC-002: focused terminalLayout, resizeScheduler and TerminalPanel Vitest checks.
- AC-003: pnpm check; format native probe; size ratchet and Directory Map review.

## Boundary review
Resize and xterm output ordering are frontend adapter orchestration, owned by the feature module. No domain or transport changes required. Native example is test tooling, not an alternate application runtime.

## Documentation
Record native reproduction command and results; update Directory Map for the extracted layout owner. Archive spec and plan after verification.
