import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createOrderedProbeConsumer } from './conpty-ordered-probe-consumer.mjs';

const { Terminal } = createRequire(import.meta.url)('@xterm/xterm');
function frame(type, seq, cols, rows, data = '') {
  const payload = Buffer.from(data);
  const header = Buffer.alloc(24);
  header.write('QTR0');
  header.writeUInt32LE(type, 4);
  header.writeBigUInt64LE(BigInt(seq), 8);
  header.writeUInt32LE(payload.length, 16);
  header.writeUInt16LE(cols, 20);
  header.writeUInt16LE(rows, 22);
  return Buffer.concat([header, payload]);
}
const snapshot = terminal => Array.from({ length: terminal.buffer.active.length }, (_, index) => {
  const line = terminal.buffer.active.getLine(index);
  return { text: line.translateToString(true), wrapped: line.isWrapped };
});

test('G0 consumer preserves native ordering across fragmented UTF-8, wrapping and control-like application bytes', async () => {
  const terminal = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  const oracle = new Terminal({ cols: 80, rows: 24, allowProposedApi: true });
  const consumer = createOrderedProbeConsumer(terminal);
  try {
    const frames = [frame(1, 1, 80, 24)];
    let seq = 1;
    const bytes = Buffer.from('QTR0 合法重复🙂\r\n'.repeat(2));
    for (let operation = 0; operation < 100; operation++) {
      const cols = operation % 2 ? 12 : 35;
      const rows = operation % 3 ? 8 : 24;
      frames.push(frame(2, ++seq, cols, rows));
      oracle.resize(cols, rows);
      // Split inside a multibyte UTF-8 codepoint across Data frames.
      frames.push(frame(3, ++seq, cols, rows, bytes.subarray(0, 6)));
      frames.push(frame(3, ++seq, cols, rows, bytes.subarray(6)));
      await new Promise(resolve => oracle.write(bytes, resolve));
    }
    const stream = Buffer.concat(frames);
    for (let offset = 0; offset < stream.length; offset += 17) {
      await consumer.write(stream.subarray(offset, offset + 17));
    }
    await consumer.finish();
    assert.equal(consumer.resizeCommits, 100);
    assert.deepEqual(snapshot(terminal), snapshot(oracle));
    assert.equal(terminal.buffer.active.cursorX, oracle.buffer.active.cursorX);
    assert.equal(terminal.buffer.active.cursorY, oracle.buffer.active.cursorY);
  } finally {
    terminal.dispose();
    oracle.dispose();
  }
});

test('G0 consumer rejects missing, replayed and truncated native frames', async () => {
  for (const bad of [frame(3, 1, 80, 24, 'no hello'), Buffer.concat([frame(1, 1, 80, 24), frame(2, 3, 80, 10)]), Buffer.concat([frame(1, 1, 80, 24), frame(1, 1, 80, 24)]), frame(1, 1, 80, 24).subarray(0, 23)]) {
    const terminal = new Terminal({ allowProposedApi: true });
    try {
      const consumer = createOrderedProbeConsumer(terminal);
      await assert.rejects(async () => { await consumer.write(bad); await consumer.finish(); });
    } finally { terminal.dispose(); }
  }
});
