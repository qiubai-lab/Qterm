---
schema: 1
id: QB-20261031-cef-popup-visibility
type: bugfix
tier: standard
status: active
created: 2026-10-31
updated: 2026-10-31
supersedes: []
---
# Windows popup tab visibility

User report: Baidu loads, but links adopted as another Browser Block tab have a
title/URL and a black content area. The preceding Windows adaptation verified
native identity and loaded documents without checking actual sibling occlusion.

## Behavior Delta
### FIXED
- Windows adopted popups must render above the main UI's full-window HWND and
  retain that ordering through tab switching, focus changes and native resize.
  Hidden/unselected pages stay hidden; native clipping and modal input rules remain.

## Acceptance
- AC-001: Reproduce the black popup with a local fixture and distinguish loaded
  content from actual HWND visibility. After repair, a selected popup is the
  frontmost native child at its unobstructed center; switching tabs and resizing
  keep the selected page visible. Visually inspect rendered popup content.
- AC-002: Preserve POST/opener, same-window ownership, nested close and isolation;
  existing Windows smoke and focused native regression tests pass.

## Implementation and verification
- [ ] TASK-001 [AC-001]: Diagnose actual HWND ordering, add the missing native
  stacking behavior in the Windows adapter and an adjacent regression test.
- [ ] TASK-002 [AC-001, AC-002]: Extend real React popup smoke to assert native
  frontmost child and tab switching; execute native checks and visual verification.

Reuse the established Windows adapter, pure tests and feature-only parent test
harness. No new frontend state, guest IPC authority or release sandbox change.
Maintain the current uncommitted adaptation and the user's running dev instance.
Verification pending.
