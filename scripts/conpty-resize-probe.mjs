import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createOrderedProbeConsumer } from './conpty-ordered-probe-consumer.mjs';
if (process.platform !== 'win32') throw new Error('This probe requires Windows ConPTY.');
const { Terminal } = createRequire(import.meta.url)('@xterm/xterm');
const source = readFileSync(new URL('../src/terminal/resizeScheduler.ts', import.meta.url), 'utf8');
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(ts.transpile(text, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString('base64')}`;
const schedulerUrl = moduleUrl(source);
const { createResizeScheduler } = await import(schedulerUrl);
const layoutSource = readFileSync(new URL('../src/terminal/terminalLayout.ts', import.meta.url), 'utf8');
const { createTerminalLayout } = await import(moduleUrl(layoutSource.replace('"./resizeScheduler"', JSON.stringify(schedulerUrl))));
const mode = process.argv[2] ?? 'fixed';
assert.ok(['fixed', 'current', 'ordered'].includes(mode), 'Use fixed, current (original scheduling), or ordered (native G0 prototype)');
const terminal = new Terminal({ cols: 80, rows: 24, scrollback: 8000, allowProposedApi: true, windowsPty: { backend: 'conpty' } });
const interval = Number(process.argv[3] ?? 16);
const outputDelay = Number(process.env.PROBE_OUTPUT_DELAY ?? 60);
assert.ok(Number.isFinite(interval) && interval >= 0 && interval <= 2000);
assert.ok(Number.isFinite(outputDelay) && outputDelay >= 0 && outputDelay <= 5000);
const executable = process.env.PROBE_EXECUTABLE ?? fileURLToPath(new URL('../src-tauri/target/debug/examples/conpty_resize_probe.exe', import.meta.url));
const child = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
const timeout = setTimeout(() => { child.kill(); throw new Error('ConPTY probe timed out'); }, 25000 + 72 * interval + 7 * outputDelay);
child.on('error', error => { clearTimeout(timeout); throw error; });
child.on('close', () => clearTimeout(timeout));
const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
let sequence = 0;
const pending = new Map();
const events = [];
const deliveries = new Set();
let streamError;
const orderedConsumer = mode === 'ordered' ? createOrderedProbeConsumer(terminal) : null;
let runtimePath;
let resizeApiReturns = 0;
const fixture = process.env.PROBE_FIXTURE ?? 'banner';
assert.ok(['banner', 'scrollback', 'live'].includes(fixture));
const output = createInterface({ input: child.stdout });
output.on('line', line => {
  const event = JSON.parse(line);
  if (event.buildNumber) { terminal.options.windowsPty = { backend: 'conpty', buildNumber: event.buildNumber }; runtimePath = event.runtimePath; return; }
  if (event.data) {
    events.push({ output: Buffer.from(event.data).toString() });
    const delivery = new Promise(resolve => setTimeout(resolve, outputDelay)).then(() => orderedConsumer
      ? orderedConsumer.write(Buffer.from(event.data))
      : new Promise(resolve => terminal.write(Uint8Array.from(event.data), resolve)))
      .catch(error => { streamError ??= error; });
    deliveries.add(delivery);
    void delivery.then(() => deliveries.delete(delivery));
  } else { resizeApiReturns++; pending.get(event.ack)?.(); pending.delete(event.ack); }
});
terminal.onData(data => send({ write: data }));
const resizePty = (cols, rows) => new Promise(resolve => {
  const id = ++sequence;
  pending.set(id, resolve);
  events.push({ resize: [cols, rows] });
  send({ cols, rows, id });
});
let dimensions = { cols: 80, rows: 24 };
const layout = createTerminalLayout(terminal, { proposeDimensions: () => dimensions, fit: () => terminal.resize(dimensions.cols, dimensions.rows) }, resizePty, 50);
const scheduler = createResizeScheduler(resizePty, mode === 'ordered' ? 0 : 50);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const resize = (cols, rows) => {
  dimensions = { cols, rows };
  if (mode === 'fixed') layout.restore();
  else if (mode === 'ordered') scheduler.request(cols, rows);
  else { terminal.resize(cols, rows); scheduler.request(cols, rows); }
};
try {
  await pause(700 + outputDelay);
  if (fixture === 'scrollback') {
    send({ write: '@echo off\rfor /L %i in (1,1,40) do @echo QTERM_LINE_%i_' + 'x'.repeat(120) + '\recho QTERM_DUPLICATE\recho QTERM_DUPLICATE\recho QTERM_FIXTURE_READY\r' });
    await pause(1000 + outputDelay);
    await Promise.all([...deliveries]);
    const initialText = Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i).translateToString(true)).join('\n');
    assert.ok(initialText.includes('QTERM_FIXTURE_READY'), 'fixture must be ready before resizing');
  }
  if (fixture === 'live') {
    send({ write: '@powershell.exe -NoLogo -NoProfile -Command "1..80 | ForEach-Object { Write-Output (\'QTERM_LIVE_\' + $_ + \'_\' + (\'x\' * 120)); Start-Sleep -Milliseconds 100 }"\r' });
  }
  for (let cycle = 0; cycle < 12; cycle++) {
    const sizes = fixture === 'live' ? [[100, 18], [60, 10], [90, 6], [70, 8], [100, 16], [80, 24]] : [[80, 18], [80, 10], [80, 6], [80, 8], [80, 16], [80, 24]];
    for (const [cols, rows] of sizes) {
      resize(cols, rows);
      await pause(interval);
    }
    await pause(0);
  }
  if (fixture === 'live') await pause(Math.max(0, 11000 - 72 * interval));
  await pause(400);
  if (mode !== 'current') {
    for (const [cols, rows] of [[100, 18], [70, 30], [80, 24]]) {
      resize(cols, rows);
      await pause(450 + outputDelay);
      assert.equal(terminal.cols, cols);
      assert.equal(terminal.rows, rows);
    }
    send({ write: 'echo QTERM_RESIZE_OK\r' });
    await pause(400 + outputDelay);
  }
  await Promise.all([...deliveries]);
  if (streamError) throw streamError;
  await orderedConsumer?.finish();
  await new Promise(resolve => terminal.write('', resolve));
  const lines = Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i).translateToString(true));
  const logicalLines = [];
  lines.forEach((line, i) => {
    if (terminal.buffer.active.getLine(i).isWrapped && logicalLines.length) logicalLines[logicalLines.length - 1] += line;
    else logicalLines.push(line);
  });
  console.log(JSON.stringify({ mode, fixture, interval, outputDelay, executable, runtimePath, nativeResizeCommits: orderedConsumer?.resizeCommits, bannerCount: lines.filter(line => line.includes('Microsoft Windows')).length, length: lines.length, lines: lines.filter(Boolean), resizeCount: sequence, resizeApiReturns, outputCount: events.filter(e => e.output).length, ...(process.env.PROBE_TRACE ? {events} : {}) }, null, 2));
  if (mode !== 'current') {
    if (mode === 'ordered') assert.ok(orderedConsumer.resizeCommits >= 20, 'exercise actual native resize boundaries');
    assert.equal(lines.filter(line => line.includes('Microsoft Windows')).length, 1, 'resize must not duplicate or lose the banner');
    assert.equal(lines.filter(line => line.includes('(c) Microsoft Corporation')).length, 1, 'existing output must survive resize');
    assert.equal(lines.filter(line => line === 'QTERM_RESIZE_OK').length, 1, 'the shell must remain usable');
    if (fixture === 'scrollback') {
      for (let i = 1; i <= 40; i++) {
        assert.equal(logicalLines.filter(line => line === `QTERM_LINE_${i}_${'x'.repeat(120)}`).length, 1, `wrapped history line ${i} must survive exactly once`);
      }
      assert.equal(logicalLines.filter(line => line === 'QTERM_DUPLICATE').length, 2, 'legitimate duplicates must survive');
    }
    if (fixture === 'live') {
      for (let i = 1; i <= 80; i++) {
        assert.equal(logicalLines.filter(line => line === `QTERM_LIVE_${i}_${'x'.repeat(120)}`).length, 1, `concurrent output line ${i} must survive exactly once`);
      }
    }
  }
} finally {
  scheduler.dispose();
  layout.dispose();
  output.close();
  send({ stop: true });
  child.stdin.end();
  terminal.dispose();
}
