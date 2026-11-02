import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { closeAllSessions, closeSession, control, openSession } from "./sessionTransport";
import { connectLocalSession } from "./services/localSessions";

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 1; bufferedAmount = 0; binaryType = "";
  onopen?: () => void; onmessage?: (event: { data: unknown }) => void; onclose?: () => void;
  send = vi.fn(); close = vi.fn(() => { this.readyState = 3; this.onclose?.(); });
  constructor(public url: string) { Socket.instances.push(this); }
  message(value: unknown) { this.onmessage?.({data: value instanceof ArrayBuffer ? value : JSON.stringify(value)}); }
}
vi.mock("./accessIdentity",()=>({accessProof:()=>({accessKey:"page-key",clientId:"page"}),accessHeaders:()=>({})}));
const proof={accessKey:"page-key",clientId:"page"};
const fetchMock = vi.fn();
beforeEach(() => { vi.useFakeTimers(); Socket.instances = []; vi.stubGlobal("WebSocket", Socket); vi.stubGlobal("fetch",fetchMock); fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>[{sessionId:"one"}]}); });
afterEach(() => { closeAllSessions(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const input = { profileId: "test-profile", auth: { method: "password" as const, password: "test-only" }, terminalSize: { columns: 80, rows: 24 } };
const consume = (_bytes:Uint8Array, done?:()=>void) => done?.();
it("restores before allowing input, acknowledges rendered bytes, and deletes only on explicit close", async () => {
  const output = vi.fn(consume);
  const connected = openSession("terminal", {...input,runtimeKey:"block"}, vi.fn(),output);
  const socket=Socket.instances[0];socket.onopen?.();
  expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({version:1,purpose:"terminal",input,runtimeKey:"block",...proof});
  socket.message({type:"ready",sessionId:"one"});expect(await connected).toBe("one");
  expect(()=>control("one",new Uint8Array([13]))).toThrow("画面正在恢复");
  socket.message(new Uint8Array([65,66]).buffer);
  expect(socket.send).toHaveBeenLastCalledWith('{"type":"ack","bytes":2}');
  socket.message({type:"restored"});control("one",new Uint8Array([13]));
  await closeSession("one");
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/runtime/sessions/one",expect.objectContaining({method:"DELETE"}));
  expect(socket.close).toHaveBeenCalledOnce();
});
it("reattaches the original session after network loss without resending passwords or input", async () => {
  const events=vi.fn();const connected=openSession("terminal",input,events,consume);const first=Socket.instances[0];
  first.onopen?.();first.message({type:"ready",sessionId:"one"});await connected;first.message({type:"restored"});
  control("one",new Uint8Array([13]));first.close();
  expect(events).toHaveBeenCalledWith({type:"stateChanged",state:"connecting"});
  expect(()=>control("one",new Uint8Array([13]))).toThrow("重新接入");
  await vi.advanceTimersByTimeAsync(1000);
  const second=Socket.instances[1];expect(String(second.url)).toContain("/runtime/attach");second.onopen?.();
  expect(second.send.mock.calls).toEqual([[JSON.stringify({version:2,sessionId:"one",...proof})]]);
});
it("page teardown detaches without deleting the server session or scheduling reconnection", async () => {
  const connected=openSession("terminal",input,vi.fn(),consume);const socket=Socket.instances[0];
  socket.message({type:"ready",sessionId:"one"});await connected;closeAllSessions();
  await vi.advanceTimersByTimeAsync(20000);expect(fetchMock).not.toHaveBeenCalled();expect(Socket.instances).toHaveLength(1);
});
it("bounds terminal input after restoration",async()=>{
  const connected=openSession("terminal",input,vi.fn(),consume);const socket=Socket.instances[0];
  socket.message({type:"ready",sessionId:"one"});await connected;socket.message({type:"restored"});
  socket.bufferedAmount=300*1024;expect(()=>control("one",new Uint8Array([65]))).toThrow("输入队列繁忙");
});
it("local restoration uses the stable block key and reports temporary disconnection",async()=>{
  const events=vi.fn();const pending=connectLocalSession(120,40,events,consume,true,"/work","block");
  const socket=Socket.instances[0];socket.onopen?.();
  expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({version:1,columns:120,rows:40,osc7Enabled:true,initialDirectory:"/work",runtimeKey:"block",...proof});
  socket.message({type:"ready",sessionId:"local",cwd:"/work"});expect(await pending).toEqual({sessionId:"local",cwd:"/work"});
  socket.close();expect(events).toHaveBeenCalledWith({type:"stateChanged",state:"connecting"});
});
it("a failed shell startup rejects without a retry that could duplicate a process",async()=>{
  const pending=connectLocalSession(80,24,vi.fn(),consume,true);const rejected=expect(pending).rejects.toThrow("shell unavailable");
  Socket.instances[0].message({type:"error",error:{message:"shell unavailable"}});await rejected;
  await vi.advanceTimersByTimeAsync(20000);expect(Socket.instances).toHaveLength(1);
});
it("reports a stopped server session without opening a replacement process",async()=>{
  const events=vi.fn();const pending=openSession("terminal",input,events,consume);
  const socket=Socket.instances[0];socket.message({type:"ready",sessionId:"one"});await pending;
  fetchMock.mockResolvedValue({ok:true,status:200,json:async()=>[]});socket.close();
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toHaveBeenCalledWith({type:"stateChanged",state:"failed"});
  await vi.advanceTimersByTimeAsync(20000);expect(Socket.instances).toHaveLength(1);
});

it("suspends all output, input and retries until unlock, then attaches the same process once", async () => {
  const {pauseData,resumeData}=await import("./dataAccess");
  const output=vi.fn(consume), events=vi.fn();
  const pending=openSession("terminal",input,events,output);
  const socket=Socket.instances[0];socket.onopen?.();socket.message({type:"ready",sessionId:"one"});await pending;
  socket.message({type:"restored"});output.mockClear();events.mockClear();
  pauseData();
  try {
    socket.message(new Uint8Array([65]).buffer);
    socket.message({type:"event",event:{type:"stateChanged",state:"failed"}});
    await vi.advanceTimersByTimeAsync(60000);
    expect(output).not.toHaveBeenCalled();expect(events).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();expect(Socket.instances).toHaveLength(1);
    expect(()=>control("one",new Uint8Array([13]))).toThrow("终端已锁定");
  } finally { resumeData(); }
  await vi.advanceTimersByTimeAsync(0);
  expect(Socket.instances).toHaveLength(2);
  const restored=Socket.instances[1];restored.onopen?.();
  expect(()=>control("one",new Uint8Array([13]))).toThrow("画面正在恢复");
  expect(restored.send).toHaveBeenCalledWith(JSON.stringify({version:2,sessionId:"one",...proof}));
  // Queued messages from the old socket stay stale after unlock.
  socket.message(new Uint8Array([66]).buffer);expect(output).not.toHaveBeenCalled();
  restored.message({type:"ready",sessionId:"one"});restored.message({type:"restored"});
  control("one",new Uint8Array([13]));
  expect(fetchMock.mock.calls.every(([,init])=>init.method!=="DELETE")).toBe(true);
});
