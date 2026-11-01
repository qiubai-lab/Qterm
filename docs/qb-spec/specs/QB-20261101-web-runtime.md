# Qterm Server runtime

Implement a single-user, single-process headless runtime sharing Qterm's Rust business rules and React workspace. Desktop IPC and data formats remain compatible.

## Ownership and scope

- `crates/qterm-core`: shared domain, application, ports, SSH/SFTP, Git and persistence. No Tauri dependency. Desktop retains native commands and infrastructure.
- `crates/qterm-server`: authenticated HTTP/WebSocket transport, process configuration, exclusive data directory, server-retained sessions and bounded streaming.
- `src/server`: browser entry, authentication lifecycle and service adapters; shared workspace, terminal and file components retain presentation ownership.
- Local PTY and filesystem access execute as the service account. Containers expose their own filesystem and persistent home. Native guest browser, system agent, Git and public forwarding remain disabled in Web.
- Browser and desktop mount the same WorkspaceShell, manager dialogs and CSS; only native capabilities and browser login/file selection are adapted. The server builds independently on Linux/macOS/Windows.

New modules remain below repository default size limits; existing baseline modules must not grow. Extract shared contracts and connection preparation before adding transport implementations.

## Required behavior

Login is independent of vault unlock. Require a deployment-provided password file (single-line plaintext or complete Argon2id hash), exact public origin, same-origin mutation requests and authenticated cookies. Startup converts plaintext to a salted hash in memory without rewriting the source file; legacy hash-only configuration remains strict and cannot be combined with the new file setting. Login expiry/logout revoke socket access. All session operations validate ownership. No arbitrary RPC dispatcher. Authenticated local file routes accept explicit absolute service-side paths, consistent with the local shell’s account permissions.

Persist configuration/workspaces/known-hosts/vault under a mounted data root. Only one server process may own this root. Preserve unknown-host confirmation and changed-host rejection. Terminal processes survive browser disconnect, refresh, logout and token rotation. Server memory owns stable Block-to-session mapping, current screen/alternate screen/scrollback and versioned file drafts; saved layout remains on disk. A bundled Node headless-xterm worker parses output while offline. Attach snapshots and live subscriptions share a lock, and flow-controlled clients resync from current screen after lag. First attachment controls input/resize; remaining views are read-only and inherit control when it detaches. Explicit stop/block close and service shutdown end processes. No input replay. Service restart cannot recover live processes or memory drafts. New blocks with an existing process but no saved layout are recovered into a separate workspace.

Browser file transfer uses bounded streaming and opaque temporary selections. Private keys are generated in Rust or imported from an explicitly selected browser file (bounded to 1 MiB); drafts are opaque, cleared on manual lock/logout and committed to the encrypted vault. Generated private keys never return to the browser. Recovery material uses an explicit download/confirmation flow; a download response does not prove durable user storage.

## Verification

Run source-size, frontend check and browser build, core/server Rust formatting, tests and clippy. Exercise real local PTY input/output/cwd/resize/logout, local file edit conflicts, settings persistence, credential drafts and rotation, shared browser UI, and real SSH/SFTP, host keys, terminal resizing, cancellation, authentication/Origin rejection and persistence. Container builds must not require GTK/WebKit. Document any unavailable environment validation explicitly.
