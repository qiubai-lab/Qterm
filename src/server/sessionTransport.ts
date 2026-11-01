import { accessProof } from "./accessIdentity";
import type { SessionConnectInput, SessionEvent, TerminalSessionConnectInput } from "../lib/tauri/sessions";
import { API, api } from "./http";

interface Connection {
  socket: WebSocket; id?: string; stopped: boolean; restoring: boolean;
  retry?: number; timer?: number; runtimeKey?: string;
  event: (event: SessionEvent) => void;
  data: (data: Uint8Array, consumed?: () => void) => void;
}
const sessions = new Map<string, Connection>();
const connections = new Set<Connection>();
export const SCREEN_STATE = "qterm:server-screen";
function failure(message: string, code = "transportLost"): SessionEvent {
  return {type:"failed",code,message,node:null,stage:null};
}
function screen(connection: Connection, phase: "start" | "end" | "geometry", columns?: number, rows?: number, cwd?: string) {
  window.dispatchEvent(new CustomEvent(SCREEN_STATE,{detail:{runtimeKey:connection.runtimeKey,phase,columns,rows,cwd}}));
}
export function openSession(purpose: "terminal" | "files", input: SessionConnectInput | TerminalSessionConnectInput, onEvent: (event: SessionEvent) => void, onData: (data: Uint8Array, consumed?: () => void) => void = (_data, consumed) => consumed?.()): Promise<string> {
  const {runtimeKey,...request} = input;
  return openSocket("/sessions", {version:1,purpose,input:request,runtimeKey},onEvent,onData).then(value=>value.sessionId);
}
export function openSocket(endpoint: string, handshake: unknown, onEvent: (event: SessionEvent) => void, onData: (data: Uint8Array, consumed?: () => void) => void): Promise<{sessionId:string;cwd?:string}> {
  return new Promise((resolve,reject)=>{
    const runtimeKey=(handshake as {runtimeKey?:string}).runtimeKey;
    const connection:Connection={socket:null as unknown as WebSocket,stopped:false,restoring:true,event:onEvent,data:onData,runtimeKey};
    connections.add(connection);
    const stopError=(message:string)=>{reject(new Error(message));onEvent(failure(message));onEvent({type:"stateChanged",state:"failed"});detach(connection);};
    function connect(path:string,input:unknown){
      const url=new URL(`${API}${path}`,location.href);url.protocol=url.protocol==="https:"?"wss:":"ws:";
      const socket=new WebSocket(url);connection.socket=socket;socket.binaryType="arraybuffer";
      connection.timer=window.setTimeout(()=>{if(!connection.id)stopError("建立终端连接超时");else socket.close();},15000);
      socket.onopen=()=>{socket.send(JSON.stringify({...input as object,...accessProof()}));input=undefined;};
      socket.onmessage=event=>{
        if (connection.stopped || connection.socket!==socket)return;
        if(event.data instanceof ArrayBuffer){
          const bytes=new Uint8Array(event.data);
          try{onData(bytes,()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:"ack",bytes:bytes.byteLength}));});}
          catch{stopError("终端视图无法消费输出；后台任务仍保留，请刷新页面");}
          return;
        }
        try{
          const value=JSON.parse(String(event.data));
          if(value.type==="ready" && value.sessionId){
            window.clearTimeout(connection.timer);
            connection.id=value.sessionId;connection.restoring=true;
            const previous=sessions.get(value.sessionId);if(previous && previous!==connection)detach(previous);
            sessions.set(value.sessionId,connection);
            screen(connection,"start",value.columns,value.rows,value.cwd);
            // Reset the browser parser before restoring a serialized framebuffer.
            onData(new TextEncoder().encode("\x1bc"));
            resolve({sessionId:value.sessionId,cwd:value.cwd});
          }else if(value.type==="restored"){
            onData(new Uint8Array(),()=>{connection.restoring=false;screen(connection,"end");});
          }else if(value.type==="geometry"){
            screen(connection,"geometry",value.columns,value.rows);
          }else if(value.type==="event" && value.event){
            onEvent(value.event);
          }else if(value.type==="resync")socket.close();
          else if(value.type==="error")stopError(value.error?.message??"连接失败，后台任务仍保留");
        }catch{stopError("服务端返回了无效的会话消息");}
      };
      socket.onerror=()=>{ /* onclose owns retries, input is never queued or replayed. */ };
      socket.onclose=()=>{
        window.clearTimeout(connection.timer);
        if(connection.stopped)return;
        if(!connection.id){stopError("无法连接终端，请重新登录或刷新页面");return;}
        onEvent({type:"stateChanged",state:"connecting"});
        connection.retry=window.setTimeout(()=>{
          void api<Array<{sessionId:string}>>("/runtime/sessions").then(list=>{if(connection.stopped)return;if(!list.some(s=>s.sessionId===connection.id)){stopError("后台会话已结束或服务已重启，请重新打开终端");return;}connect("/runtime/attach",{version:2,sessionId:connection.id});}).catch(()=>{
            if(!connection.stopped)connection.retry=window.setTimeout(()=>socket.onclose?.(new CloseEvent("close")),3000);
          });
        },1000);
      };
    }
    connect(endpoint,handshake);handshake=undefined;
  });
}
function detach(connection:Connection){
  connection.stopped=true;window.clearTimeout(connection.timer);window.clearTimeout(connection.retry);
  connection.socket.close();if(connection.id)sessions.delete(connection.id);connections.delete(connection);
}
export function control(id:string,value:unknown):void {
  const c=sessions.get(id);
  if(!c || c.socket.readyState!==WebSocket.OPEN)throw new Error("正在重新接入终端，请稍后输入");
  if(c.restoring) { if(value instanceof Uint8Array)throw new Error("终端画面正在恢复，请稍后输入"); return; } // Browser resize/query callbacks during restoration must not mutate the PTY.
  if(c.socket.bufferedAmount>256*1024)throw new Error("终端输入队列繁忙");
  if(value instanceof Uint8Array)c.socket.send(value);else c.socket.send(JSON.stringify(value));
}
export async function closeSession(id:string):Promise<void>{
  await api(`/runtime/sessions/${encodeURIComponent(id)}`,"DELETE");
  const c=sessions.get(id);if(c)detach(c);
}
/** Page teardown and authentication changes detach views, never stop server processes. */
export function closeAllSessions():void {for(const connection of [...connections])detach(connection);}
