# ConPTY ordered output: G0 prototype

This directory is **not a production runtime**. Qterm does not load this host.
The active change is [QB-20260904-conpty-ordered-resize](../../docs/qb-spec/specs/QB-20260904-conpty-ordered-resize.md).

`upstream.lock.json` pins the tested Microsoft Terminal revision, build tool
revision and official ConPTY package/DLL digests. `patches/g0-ordered-output.patch`
is an experimental patch to that revision, under the upstream MIT license
(`LICENSE.upstream.txt`). Preserve the patch's byte-level line endings.

The prototype frames output inside `VtIo::_flushNow`. It seals old output after
`EraseBeforeResize`, holds resize-produced output, then publishes the successful
buffer dimensions before subsequent data. The hook is in
`SCREEN_INFORMATION::ResizeScreenBuffer`, not in the Rust reader or resize IPC.
It also sees application Console API calls through that method. QTR0 control
records are outside child VT data; they cannot be forged by printing their magic.

## Rebuild on Windows x64

Requires Visual Studio 2022 C++ tools, Windows SDK 10.0.22621.0, Rust and the
repository's Node dependencies. Prepare separate checkouts of both repositories
at the exact revisions in `upstream.lock.json`; use a complete vcpkg clone because
its pinned ports include historical trees. Do not use the upstream dependency
baseline as the vcpkg **tool** revision: its old MSYS package URLs now return 404.

```powershell
./scripts/build-conpty-prototype.ps1 -SourceDirectory <terminal-checkout> -VcpkgRoot <vcpkg-checkout>
$env:PROBE_EXECUTABLE = "$PWD/src-tauri/target/conpty-ordered-prototype/conpty_resize_probe.exe"
$env:QTERM_ORDERED_PROBE = '1'
$env:PROBE_OUTPUT_DELAY = '200'
node scripts/conpty-resize-probe.mjs ordered 140
$env:PROBE_FIXTURE = 'scrollback'
node scripts/conpty-resize-probe.mjs ordered 140
$env:PROBE_FIXTURE = 'live'
node scripts/conpty-resize-probe.mjs ordered 140
Remove-Item Env:QTERM_ORDERED_PROBE, Env:PROBE_EXECUTABLE, Env:PROBE_OUTPUT_DELAY, Env:PROBE_FIXTURE
```

The builder verifies source identities and package hashes, applies only this
patch, restores dependencies, builds the host and stages it with the DLL and
probe under Cargo's ignored target directory. `build-identity.json` records the
actual host/DLL/patch hashes. It does not install or deploy anything to Qterm.
`ordered` requires native frames and at least 20 actual native resize events;
the API return counter is reported separately and is not a resize barrier.

## G0 gaps: do not connect this protocol to the application

- QTR0 has no frozen production ABI, session identity, request ID, superseded
  request events or complete fault/closed contract. The environment flag is only
  an isolated probe switch, not a secure runtime capability negotiation scheme.
- Initial dimensions now come from launch arguments; early resize during the
  startup handshake still needs explicit coverage and final state reconciliation.
- The patch retains the upstream overlapped writer and console locking. Bounded
  backpressure, cancellation while a write is blocked, and the 8 MiB memory
  budget have **not** been proven. `_front`/`_back` are still strings, not a bounded
  production queue. Splitting records to 64 KiB does not bound that queue.
- Failure currently closes the output handle; a production fault must settle
  pending requests and terminate the session predictably.
- Direct `ResizeTraditional`, alternate-buffer restoration and viewport-only
  changes still require a complete audit. One hook is not an exhaustive proof.
- No Tauri output/credit/mailbox wiring, packaging, ARM64, GUI, macOS or SSH
  acceptance has been completed. Passing G0 examples does not complete the spec.

The next implementation step is to resolve those native lifecycle/ordering
contracts and freeze the ABI before TASK-004–006 production wiring.
