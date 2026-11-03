// Private stdio protocol. No terminal output or credentials are written to stderr.
import { serializeMouseEncoding } from './mouseEncoding.mjs';
import { PendingSequence } from './pendingSequence.mjs';
import readline from 'node:readline';
import headless from '@xterm/headless/lib-headless/xterm-headless.js';
import { SerializeAddon } from '@xterm/addon-serialize';
const { Terminal } = headless;
const terminals = new Map();
async function request(input) {
  if (input.op === 'destroy') { terminals.get(input.id)?.terminal.dispose(); terminals.delete(input.id); return {}; }
  if (input.op === 'create' || input.op === 'restore') {
    terminals.get(input.id)?.terminal.dispose();
    const snapshot = input.op === 'restore' ? input.snapshot : null;
    if (snapshot) input = {...input,columns:snapshot.columns,rows:snapshot.rows};
    const terminal = new Terminal({cols:input.columns,rows:input.rows,scrollback:Math.min(2000,Math.floor(65536/input.columns)),allowProposedApi:true,...(input.windowsPty?{windowsPty:input.windowsPty}:{})});
    const serialize = new SerializeAddon();
    terminal.loadAddon(serialize);
    const entry = {terminal,serialize,responses:[],cwd:null,pending:new PendingSequence()};
    terminal.onData(data => entry.responses.push(data));
    terminal.parser.registerOscHandler(7, value => {
      try { const url = new URL(value); if (url.protocol === 'file:') entry.cwd = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/,'$1'); } catch { /* Invalid OSC metadata is ignored. */ }
      return true;
    });
    terminals.set(input.id,entry);
    if (snapshot) {
      // Restore only parser state, never route replayed terminal queries to the PTY.
      await new Promise(resolve => terminal.write(snapshot.data,resolve));
      const pending = Buffer.from(snapshot.pending || '', 'base64');
      if (pending.length) {
        entry.pending.feed(pending);
        await new Promise(resolve => terminal.write(pending,resolve));
      }
      entry.cwd = snapshot.cwd;
      entry.responses = [];
    }
    return {};
  }
  const entry = terminals.get(input.id);
  if (!entry) throw new Error('screenUnavailable');
  const {terminal,serialize} = entry;
  if (input.op === 'write') {
    entry.responses = [];
    const bytes=Buffer.from(input.data,'base64');
    entry.pending.feed(bytes);
    await new Promise(resolve => terminal.write(bytes,resolve));
    return {responses:entry.responses,cwd:entry.cwd};
  }
  if (input.op === 'resize') { terminal.resize(input.columns,input.rows); terminal.options.scrollback=Math.min(2000,Math.floor(65536/input.columns)); return {}; }
  if (input.op === 'snapshot') {
    // Serialize state, not raw historic escape sequences (no replayed OSC side effects).
    return {data:serialize.serialize({scrollback:2000}) + serializeMouseEncoding(terminal),pending:entry.pending.snapshot(),columns:terminal.cols,rows:terminal.rows,cwd:entry.cwd};
  }
  throw new Error('invalidScreenOperation');
}
for await (const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})) {
  try { process.stdout.write(JSON.stringify({ok:true,...await request(JSON.parse(line))})+'\n'); }
  catch { process.stdout.write('{"ok":false}\n'); }
}
for (const {terminal} of terminals.values()) terminal.dispose();
