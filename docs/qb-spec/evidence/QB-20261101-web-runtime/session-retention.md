# Server-owned session retention — 2026-11-01

Implemented browser-independent PTY/SSH/SFTP ownership, stable Block IDs, snapshot-and-tail attachment, automatic reconnection without input replay, bounded headless-xterm screens, one writer per terminal, versioned workspace snapshots and in-memory file drafts. Node.js 24 and the bundled screen worker are included in the container; `make dev-server` builds the worker before starting Rust.

## Verified

- `pnpm check`: 1,500 frontend tests passed, 2 skipped; Node script tests 41 passed, 1 skipped; source-size, ESLint, TypeScript and desktop frontend build passed.
- `pnpm test:web`: 12 tests passed, covering authentication, transport restoration, explicit deletion versus detach, readonly control, reconnect without replay and missing-session handling.
- Headless screen tests: alternate screen, normal history, Unicode, color, cursor position, incomplete CSI/UTF-8 prefixes, resizing, offline terminal queries and round-trip serialization.
- Rust workspace tests: core 268 passed / 6 ignored, protocol 7 passed, server 21 passed. Server coverage includes stable workspace identity, stale revision rejection, draft retention across logout and unauthorized access. Workspace clippy and rustfmt passed.
- Real Linux PTY: same session ID and shell PID after browser detachment and logout/login; output produced while detached is restored; full-screen Unicode content survives; a second attachment is readonly and receives control when the writer detaches; explicit stop removes the session. Unsaved block layout is recovered into a workspace.
- Real OpenSSH/SFTP: host key confirmation/change rejection, resize, file edit conflict, upload/download/cancel, slow-view resync under 2 MiB output, reconnect to the same SSH session after logout with the vault still locked, and use of the retained SFTP session. Server restart clears runtime sessions while preserving configuration.
- Docker image: builds successfully; read-only, unprivileged container passes the local PTY and retained-session acceptance scripts.
- BetterWright browser: two workspace tabs retained the same backend session IDs after reload; background output and a full-screen CLI test screen survived navigation away and reopening; an unsaved editor draft returned in edit mode while the disk file remained unchanged.
- Demo production build and site asset/link checks passed.

[Browser proof: retained terminal and unsaved draft](retained-workspace-draft.png) · [Restored alternate screen and draft](retained-fullscreen-draft.png)

A stress test exposed TCP reset during immediate socket disposal after a resync notification. The server now completes a bounded close handshake before disposal; the SSH regression exercises this path.

## Boundaries

All fixtures use temporary data, temporary passwords and isolated loopback listeners. No user login files or existing services were changed. The screen test uses a representative full-screen terminal program; it does not launch a real Codex CLI session or make model API calls.

Windows/macOS native build and PTY/retention acceptance are configured in CI and were not executed on this Linux host. The Windows headless terminal receives the same ConPTY metadata as the browser renderer.

Live processes, terminal screens and file drafts survive browser detachment only while the server process and its host remain running. Restarting the service/container does not preserve these in-memory states. Configuration and workspace layout remain on disk. Transfers are cancelled on logout; incomplete browser operations that have not reached the server cannot be recovered. Historic output uses a bounded scrollback, not an unlimited log.
