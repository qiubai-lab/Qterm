# Windows resize regression

Windows ConPTY emits full-screen repaint sequences after a resize. Resizing xterm on every drag event while independently throttling the backend can parse an old, taller repaint into a smaller viewport, creating duplicate scrollback. Pairing resize calls alone does not order the asynchronous repaint output.

`terminalLayout.ts` holds the Windows grid steady until measurements have been quiet for 120ms, drains bytes already queued in xterm, and then applies the final dimensions and schedules the backend resize. Unix/SSH layout remains immediate. This does not clear or deduplicate terminal output. The short settling interval is a UI scheduling policy, not a transport acknowledgment or a guarantee against arbitrarily delayed native output.

## Automated checks

Run the portable regression with real xterm's parser/buffer (no DOM renderer):

```powershell
pnpm exec vitest run src/terminal/terminalLayout.test.ts src/terminal/terminalLayout.conpty.test.ts src/terminal/resizeScheduler.test.ts src/terminal/TerminalPanel.test.tsx
```

Run the real Windows ConPTY probe from the repository root:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --example conpty_resize_probe
node scripts/conpty-resize-probe.mjs current
node scripts/conpty-resize-probe.mjs fixed
```

The probe starts an isolated `cmd.exe /d`, uses the real system build number and portable-pty, delivers output to xterm with 60ms simulated channel latency, and repeatedly changes the viewport between 6 and 24 rows. `current` characterizes the previous scheduler and prints duplicates; `fixed` uses the production layout controller, asserts one welcome banner and preserved copyright text, checks settled dimensions, and executes a marker command to verify input still works. Both terminate their child shell. Default fixed mode takes about six seconds; a 20-second watchdog bounds failures.

`PROBE_OUTPUT_DELAY` overrides the channel delay in milliseconds; an optional third argument changes each drag step interval (default 16ms). `PROBE_TRACE=1` prints the synthetic session's raw output and resize requests. The native probe needs Windows and a debug example build; ordinary `pnpm check` does not launch native shells.

## Desktop check

In a fresh Windows local terminal, resize the window and split pane repeatedly in both axes. Existing output should not multiply; after pausing the terminal should fit within about 120ms plus scheduling/IPC time. Also check a long wrapped command, existing scrollback, switching workspaces, and typing after resizing. Native graphical dragging, renderer appearance, and macOS/Linux runtime behavior remain separate from the buffer-level automated checks.
