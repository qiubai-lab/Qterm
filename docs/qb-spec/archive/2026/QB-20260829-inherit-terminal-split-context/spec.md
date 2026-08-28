---
id: QB-20260829-inherit-terminal-split-context
type: feature
tier: strict
status: verified
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# Inherit terminal split connection and directory context

## Goal

When a user creates a terminal split, open an independent terminal for the source Block's configured target and, when the source terminal has a confirmed OSC 7 directory, start the new terminal from that last reported directory.

Approval: the user explicitly approved planning and implementation on 2026-08-29 after reviewing the proposed independent-session and one-time-directory design.

Implementation began on 2026-08-29 after an independent strict-tier quality review found the requirements, behavior delta, acceptance criteria, and verification trace complete.

## Scope

- Unify in-Block split buttons, keyboard split shortcuts, and the utility-rail terminal action behind one context-aware terminal split operation.
- Copy the source layout leaf's connection profile into the new terminal. A source without a profile continues to create a local terminal.
- Snapshot a source terminal's directory only while it is connected and its runtime directory source is `osc7`.
- Carry the snapshot as ephemeral launch context through local or SSH terminal startup.
- Validate and safely encode the directory before it reaches a local process working-directory API or remote Shell initialization payload.
- Preserve the existing automatic configured-auth flow and manual authentication fallback.

## Non-Goals

- Sharing the source PTY, interactive Shell process, terminal buffer, or SSH session lifecycle.
- Pooling or reusing the source session's authenticated SSH transport.
- Persisting the runtime directory or launch context in the Workspace document.
- Treating a Files Block's current browsing path as an OSC 7 terminal directory.
- Adding directory initialization syntax for Shells outside the currently supported Bash, Zsh, Fish, and PowerShell set.

## Assumptions

- “Current/parent window” means the layout leaf used as the split anchor.
- An OSC 7 directory is the last confirmed snapshot; a foreground program that changes its own directory without emitting OSC 7 cannot be observed.
- Reusing a connection means reusing its profile, route, user, and authentication policy while creating an independent terminal session.

## Requirements

- REQ-001: Every terminal-creation split entry point MUST create a new independent Terminal Block using the anchor leaf's `profileId`; a null profile MUST retain the local-terminal behavior.
- REQ-002: If the anchor is a connected Terminal Block with a non-empty `cwd` whose `cwdSource` is `osc7`, the split operation MUST snapshot that directory as one-time launch context. Otherwise it MUST omit the directory and use the target's normal default directory.
- REQ-003: One-time launch context MUST remain runtime-only, MUST NOT be added to the versioned Workspace document, and MUST be consumed only by the intended new Block.
- REQ-004: Remote directory initialization MUST accept only a bounded, non-NUL path and MUST use Shell-specific literal quoting for Bash, Zsh, Fish, and PowerShell. Directory initialization MUST occur before the initial OSC 7 report and before the session becomes user-interactive.
- REQ-005: Unsupported Shells, invalid paths, missing paths, permission failures, and directory-change failures MUST degrade to the normal connection directory without failing or delaying the underlying terminal connection beyond the existing Shell-detection behavior.
- REQ-006: Local terminal splits MUST use a valid inherited directory as the spawned process working directory and otherwise fall back to the existing canonical home directory.
- REQ-007: Splitting MUST preserve the existing configured-auth flow. Stored credentials and SSH Agent may reconnect automatically; manual authentication may prompt again, and plaintext secrets MUST NOT be copied into layout or long-lived runtime state.
- REQ-008: The new terminal MUST maintain its own OSC 7 state after startup so its reported directory can diverge independently from the source terminal.

## Behavior Delta

### ADDED

- REQ-002: A split terminal can inherit the source terminal's last confirmed OSC 7 directory as one-time launch context.
- REQ-004: Remote Shell initialization safely applies a bounded inherited directory before installing/reporting OSC 7 state.
- REQ-006: Local terminal startup can use a validated one-time inherited working directory.

### MODIFIED

- REQ-001: Terminal splits previously created an unconfigured local terminal; they now inherit the anchor Block's connection profile while remaining independent sessions.
- REQ-007: Automatically configured targets continue through the existing auth path, while manual secrets remain deliberately non-reusable.

## Acceptance Criteria

- AC-001 [REQ-001, REQ-007, REQ-008]: Splitting a remote terminal creates a distinct Block with the same profile, starts an independent session through the existing auth policy, and does not share runtime/output state with the source.
- AC-002 [REQ-001, REQ-002, REQ-003]: All terminal split entry points use the same context-aware operation; an OSC 7-ready source supplies its current directory only to the newly created Block, and the Workspace serialization contains no launch directory.
- AC-003 [REQ-002, REQ-004, REQ-005]: A supported remote Shell receives a safely quoted directory initialization before its OSC 7 Hook; absent, invalid, unsupported, or failed initialization leaves the connection usable in its default directory.
- AC-004 [REQ-004]: POSIX and PowerShell path quoting treats quotes, whitespace, command substitutions, separators, newlines, and other metacharacters as literal path content, rejects NUL/over-limit input, and never emits a second executable command from path data.
- AC-005 [REQ-006, REQ-008]: A local split starts in an existing inherited OSC 7 directory; an invalid or unavailable directory falls back to canonical home, and the child terminal subsequently owns its own directory reports.
- AC-006 [REQ-002, REQ-005]: A connected source without an OSC 7 directory, a disconnected source, and a non-terminal anchor inherit only the connection profile and open at the normal target directory without an additional failure prompt.

## Constraints And Risks

- OSC 7 data is untrusted terminal output. It must never be concatenated into executable text without bounded validation and Shell-specific literal quoting.
- Remote path existence cannot be checked locally. The remote initialization command must make `cd`/`Set-Location` failure non-fatal and install the Hook against the actual resulting directory.
- The existing Shell cache/detection remains the authority for selecting initialization syntax. When no supported Shell is available, the directory is ignored.
- Existing uncommitted OSC7 Tag style fixes in the same working tree are preserved and are outside this feature's behavior scope.

## Open Issues

None blocking. Authenticated SSH transport pooling remains a separate optional performance change.

## Verification Evidence

- VER-001 / AC-001, AC-002, AC-005, AC-006: focused Workspace, layout, shell-entry, and IPC adapter suites passed; the provider regressions prove profile inheritance, connected OSC 7 gating, one-Block delivery, one-time consumption, local delivery, disconnected fallback, and absence from serialized Workspace JSON.
- VER-002 / AC-003, AC-004, AC-005, AC-006: Rust domain and infrastructure tests passed for bounded validation, printable Shell-specific encoding of quotes/control characters/Unicode, initialization-before-OSC7 ordering, and local filesystem fallback.
- VER-003: `pnpm check` passed on 2026-08-29: ESLint, 60 Vitest files / 491 tests, TypeScript, and Vite production build.
- VER-004: `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test --all-targets --all-features` passed on 2026-08-29; Rust result was 193 passed, 3 pre-existing environment-dependent OpenSSH tests ignored, 0 failed.
- VER-005 / AC-002: Workspace schema remains version 6; launch directory exists only in `WorkspaceProvider` runtime refs and terminal connect DTOs, and serialization regressions reject its presence in the document.
