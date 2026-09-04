import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import assert from 'node:assert/strict';
if (process.platform !== 'win32') throw new Error('This probe requires Windows ConPTY.');
const { Terminal } = createRequire(import.meta.url)('@xterm/xterm');
const source = readFileSync(new URL('../src/terminal/resizeScheduler.ts', import.meta.url), 'utf8');
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(ts.transpile(text, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 })).toString('base64')}`;
const schedulerUrl = moduleUrl(source);
const { createResizeScheduler } = await import(schedulerUrl);
const layoutSource = readFileSync(new URL('../src/terminal/terminalLayout.ts', import.meta.url), 'utf8');
const { createTerminalLayout } = await import(moduleUrl(layoutSource.replace('"./resizeScheduler"', JSON.stringify(schedulerUrl))));
const mode = process.argv[2] ?? 'fixed';
assert.ok(['fixed', 'current'].includes(mode), 'Use fixed or current (the original scheduling)');
const terminal = new Terminal({ cols: 80, rows: 24, scrollback: 8000, allowProposedApi: true, windowsPty: { backend: 'conpty' } });
const child = spawn(fileURLToPath(new URL('../src-tauri/target/debug/examples/conpty_resize_probe.exe', import.meta.url)), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
const timeout = setTimeout(() => { child.kill(); throw new Error('ConPTY probe timed out'); }, 20000);
child.on('error', error => { clearTimeout(timeout); throw error; });
child.on('close', () => clearTimeout(timeout));
const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
let sequence = 0;
const pending = new Map();
const events = [];
const output = createInterface({ input: child.stdout });
output.on('line', line => {
  const event = JSON.parse(line);
  if (event.buildNumber) { terminal.options.windowsPty = { backend: 'conpty', buildNumber: event.buildNumber }; return; }
  if (event.data) {
    events.push({ output: Buffer.from(event.data).toString() });
    setTimeout(() => terminal.write(Uint8Array.from(event.data)), Number(process.env.PROBE_OUTPUT_DELAY ?? 60));
  } else { pending.get(event.ack)?.(); pending.delete(event.ack); }
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
const scheduler = createResizeScheduler(resizePty, 50);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const resize = (cols, rows) => {
  dimensions = { cols, rows };
  if (mode === 'fixed') layout.restore();
  else { terminal.resize(cols, rows); scheduler.request(cols, rows); }
};
try {
  await pause(700);
  for (let cycle = 0; cycle < 12; cycle++) {
    for (const [cols, rows] of [[80, 18], [80, 10], [80, 6], [80, 8], [80, 16], [80, 24]]) {
      resize(cols, rows);
      await pause(Number(process.argv[3] ?? 16));
    }
    await pause(0);
  }
  await pause(400);
  if (mode === 'fixed') {
    for (const [cols, rows] of [[100, 18], [70, 30], [80, 24]]) {
      resize(cols, rows);
      await pause(450);
      assert.equal(terminal.cols, cols);
      assert.equal(terminal.rows, rows);
    }
    send({ write: 'echo QTERM_RESIZE_OK\r' });
    await pause(400);
  }
  await new Promise(resolve => terminal.write('', resolve));
  const lines = Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i).translateToString(true));
  console.log(JSON.stringify({ mode, bannerCount: lines.filter(line => line.includes('Microsoft Windows')).length, length: lines.length, lines: lines.filter(Boolean), resizeCount: sequence, outputCount: events.filter(e => e.output).length, ...(process.env.PROBE_TRACE ? {events} : {}) }, null, 2));
  if (mode === 'fixed') {
    assert.equal(lines.filter(line => line.includes('Microsoft Windows')).length, 1, 'resize must not duplicate or lose the banner');
    assert.equal(lines.filter(line => line.includes('(c) Microsoft Corporation')).length, 1, 'existing output must survive resize');
    assert.equal(lines.filter(line => line === 'QTERM_RESIZE_OK').length, 1, 'the shell must remain usable');
  }
} finally {
  scheduler.dispose();
  layout.dispose();
  output.close();
  send({ stop: true });
  child.stdin.end();
  terminal.dispose();
}
