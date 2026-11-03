import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { PendingSequence } from '../src/server/screen/pendingSequence.mjs';

test('partial ANSI and UTF-8 prefixes survive reconnect without replaying completed sequences',()=>{
  const parser=new PendingSequence();
  const prefix=()=>Buffer.from(parser.snapshot(),'base64');
  parser.feed(Buffer.from('old\x1b[31'));assert.equal(prefix().toString(),'\x1b[31');
  parser.feed(Buffer.from('mred\x1b[0m'));assert.equal(prefix().length,0);
  const bytes=Buffer.from('中');parser.feed(bytes.subarray(0,2));assert.deepEqual(prefix(),bytes.subarray(0,2));
  parser.feed(bytes.subarray(2));assert.equal(prefix().length,0);
  parser.feed(Buffer.from('\x1b]7;file:///work'));assert.equal(prefix().toString(),'\x1b]7;file:///work');
  parser.feed(Buffer.from('\x1b\\'));assert.equal(prefix().length,0);
  parser.feed(Buffer.from('\x1b]52;'+ 'a'.repeat(20000)));assert.ok(prefix().length<=4096);
  parser.feed(Buffer.from('\x1b\\hello'));assert.equal(prefix().length,0);
});

test('headless worker restores alternate screen, scrollback, cursor, pending input and handles queries offline',async t=>{
  const child=spawn(process.execPath,['src/server/screen/worker.mjs'],{stdio:['pipe','pipe','inherit']});
  t.after(()=>child.kill());
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  async function call(op,values={}){
    child.stdin.write(JSON.stringify({id:'first',op,...values})+'\n');
    const result=JSON.parse((await lines.next()).value);assert.equal(result.ok,true);return result;
  }
  const write=(data,id='first')=>call('write',{id,data:Buffer.from(data).toString('base64')});
  await call('create',{columns:80,rows:24});
  await write('history\r\n\x1b[?1049h\x1b[2J\x1b[3;8H\x1b[31m中文 CLI state\x1b[0m\x1b]7;file:///work\x07');
  const query=await write('\x1b[6n');assert.deepEqual(query.responses,['\x1b[3;22R']);
  const screen=await call('snapshot');assert.match(screen.data,/history/);assert.match(screen.data,/1049h/);assert.match(screen.data,/中文 CLI state/);assert.equal(screen.cwd,'/work');
  assert.ok(!screen.data.includes('file:///work'));assert.ok(!screen.data.includes('\x1b[6n'));
  await call('create',{id:'second',columns:80,rows:24});await write(screen.data,'second');
  const restored=await call('snapshot',{id:'second'});assert.equal(restored.data,screen.data);
  await write('\x1b[32');const partial=await call('snapshot');assert.equal(Buffer.from(partial.pending,'base64').toString(),'\x1b[32');
  await call('create',{id:'third',columns:80,rows:24});
  await write(Buffer.concat([Buffer.from(partial.data),Buffer.from(partial.pending,'base64')]),'third');
  await write('mGREEN','third');
  await write('mGREEN');const finished=await call('snapshot');assert.equal(finished.pending,'');assert.match(finished.data,/GREEN/);
  assert.equal((await call('snapshot',{id:'third'})).data,finished.data);
  await call('resize',{columns:100,rows:30});assert.equal((await call('snapshot')).columns,100);
  await call('destroy');
});

test('worker snapshots preserve mouse encoding across attach and worker recovery', async t => {
  const { default: headless } = await import('@xterm/headless/lib-headless/xterm-headless.js');
  const child = spawn(process.execPath, ['src/server/screen/worker.mjs'], {stdio:['pipe','pipe','inherit']});
  t.after(() => child.kill());
  const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]();
  async function call(op, values = {}) {
    child.stdin.write(JSON.stringify({id:'mouse',op,...values})+'\n');
    const result = JSON.parse((await lines.next()).value);
    assert.equal(result.ok,true);
    return result;
  }
  for (const [mode, encoding] of [['', 'DEFAULT'], ['\x1b[?1006h','SGR'], ['\x1b[?1016h','SGR_PIXELS'], ['\x1b[?1006h\x1b[?1006l','DEFAULT'], ['\x1b[?1016h\x1b[?1016l','DEFAULT']]) {
    await call('create',{columns:80,rows:24});
    const data = '\x1b[?1049h\x1b[?1002h' + mode;
    await call('write',{data:Buffer.from(data).toString('base64')});
    const snapshot = await call('snapshot');
    const terminal = new headless.Terminal({allowProposedApi:true});
    try {
      await new Promise(resolve => terminal.write(snapshot.data,resolve));
      assert.equal(terminal.modes.mouseTrackingMode,'drag');
      assert.equal(terminal._core.coreMouseService.activeEncoding,encoding);
      const reports = [];
      terminal.onData(data => reports.push(['text',data]));
      terminal.onBinary(data => reports.push(['binary',data]));
      terminal._core.coreMouseService.triggerMouseEvent({col:10,row:5,x:110,y:60,button:0,action:1,ctrl:false,alt:false,shift:false});
      assert.deepEqual(reports, encoding === 'DEFAULT' ? [['binary','\x1b[M +&']] : [['text',encoding === 'SGR' ? '\x1b[<0;11;6M' : '\x1b[<0;110;60M']]);
    } finally { terminal.dispose(); }
    await call('restore',{snapshot});
    assert.equal((await call('snapshot')).data,snapshot.data);
  }
  await call('write',{data:Buffer.from('\x1bc').toString('base64')});
  const reset = await call('snapshot');
  assert.ok(!reset.data.includes('[?1002h'));
  assert.ok(!reset.data.includes('[?1006h'));
  assert.ok(!reset.data.includes('[?1016h'));
});
