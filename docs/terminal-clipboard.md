# Terminal clipboard

Qterm supports application-initiated clipboard writes through OSC 52 in both
local and SSH terminals. No shell hook is needed. Applications such as Codex
emit the sequence when copying their own selection; Qterm writes its decoded
text through the existing native clipboard service.

- Supported form: `ESC ] 52 ; c ; BASE64 BEL` (or an `ESC \` terminator).
- An empty selection field also targets the system clipboard.
- Payloads must be canonical Base64 containing valid UTF-8, up to 1 MiB decoded.
  An empty payload clears the clipboard.
- Clipboard queries (`?`), PRIMARY/selection and cut-buffer targets, malformed
  payloads, and oversized writes are ignored. Qterm never returns clipboard
  contents to the application through this protocol.
- Writes are awaited in parser order. Native clipboard failures are contained
  so later output and clipboard writes continue.

When xterm has a selection, Qterm's copy shortcuts copy that selection. Without
one, copy keys are passed through to the terminal application; ordinary Ctrl+C
still reaches the shell. Paste behavior is unchanged. The context menu only
recognizes xterm selections, not selections rendered by a TUI. On Windows/Linux,
hold Shift while dragging to create an xterm selection in mouse-reporting mode.

## Manual verification

In a local POSIX shell or the same SSH session running Codex, run:

```sh
printf '\033]52;c;%s\a' "$(printf %s 'qterm-osc52-test' | base64 | tr -d '\n')"
```

Paste into another application and verify `qterm-osc52-test`. This replaces the
current clipboard. Then select output inside Codex and invoke its copy action
(Ctrl+C or Enter as indicated by its selection footer); verify the copied text
outside Qterm. Also check Shift-drag followed by Qterm's copy menu and ordinary
shell Ctrl+C/paste. If a multiplexer is used, verify its OSC 52 passthrough
configuration separately.

Automated coverage uses a real xterm parser for split sequences, both
terminators, Unicode, bounds, invalid requests, ordering, failure recovery, and
addon disposal. Native clipboard delivery and the remote application's emitted
sequences still need the above desktop verification.
