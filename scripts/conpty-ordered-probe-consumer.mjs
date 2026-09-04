import assert from 'node:assert/strict';

// G0-only QTR0 transport. This is intentionally not an application IPC contract.
export function createOrderedProbeConsumer(terminal) {
  let pending = Buffer.alloc(0);
  let sequence = 0n;
  let hello = false;
  let resizeCommits = 0;
  let queue = Promise.resolve();
  return {
    get resizeCommits() { return resizeCommits; },
    write(chunk) {
      queue = queue.then(async () => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 24) {
          assert.equal(pending.toString('ascii', 0, 4), 'QTR0', 'native framing required');
          const type = pending.readUInt32LE(4);
          const seq = pending.readBigUInt64LE(8);
          const length = pending.readUInt32LE(16);
          const cols = pending.readUInt16LE(20);
          const rows = pending.readUInt16LE(22);
          assert.ok(length <= 65536, 'bounded native frame');
          if (pending.length < 24 + length) return;
          assert.equal(seq, ++sequence, 'native stream must be contiguous');
          assert.ok(cols > 0 && rows > 0);
          const payload = pending.subarray(24, 24 + length);
          pending = pending.subarray(24 + length);
          if (type === 1) {
            assert.ok(!hello && seq === 1n && length === 0);
            hello = true;
            terminal.resize(cols, rows);
          } else {
            assert.ok(hello, 'Hello precedes all output');
            if (type === 2) {
              assert.equal(length, 0);
              terminal.resize(cols, rows);
              resizeCommits++;
            } else {
              assert.equal(type, 3);
              await new Promise(resolve => terminal.write(Uint8Array.from(payload), resolve));
            }
          }
        }
      });
      return queue;
    },
    async finish() {
      await queue;
      assert.ok(hello);
      assert.equal(pending.length, 0, 'no truncated native frame');
    },
  };
}
