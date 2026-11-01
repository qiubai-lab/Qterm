import { afterEach, expect, it, vi } from "vitest";
import type { Terminal } from "@xterm/xterm";
import { bindServerScreen } from "./serverScreenBinding";
vi.mock("../lib/runtime/environment", () => ({isServer:true}));
afterEach(()=>vi.unstubAllGlobals());
it("holds the server grid through restoration and read-only viewing, then fits after control handoff",()=>{
  vi.stubGlobal("requestAnimationFrame",(run:()=>void)=>{run();return 1;});
  let resized:(size:{cols:number;rows:number})=>void=()=>undefined;
  const disposal=vi.fn();
  const terminal={cols:120,rows:40,reset:vi.fn(),
    parser:{registerCsiHandler:vi.fn(()=>({dispose:disposal})),registerOscHandler:vi.fn(()=>({dispose:disposal}))},
    onResize:(callback:typeof resized)=>{resized=callback;return {dispose:disposal};},
    resize:vi.fn((cols:number,rows:number)=>{terminal.cols=cols;terminal.rows=rows;resized({cols,rows});}),
    write:(_text:string,done:()=>void)=>done(),
  };
  const fit=vi.fn(),cwd=vi.fn();
  const binding=bindServerScreen(terminal as unknown as Terminal,()=>"block",fit,cwd);
  const send=(value:object)=>window.dispatchEvent(new CustomEvent("qterm:server-screen",{detail:{runtimeKey:"block",...value}}));
  send({phase:"start",columns:80,rows:24,cwd:"/work",readOnly:true});
  expect(cwd).toHaveBeenCalledWith("/work");
  terminal.resize(120,40);expect([terminal.cols,terminal.rows]).toEqual([80,24]);
  send({phase:"end",readOnly:true});expect(fit).not.toHaveBeenCalled();
  send({phase:"geometry",columns:90,rows:30});expect([terminal.cols,terminal.rows]).toEqual([90,30]);
  send({phase:"access",readOnly:false});expect(fit).toHaveBeenCalledOnce();
  terminal.resize(120,40);expect(terminal.cols).toBe(120);
  binding.dispose();expect(disposal).toHaveBeenCalledTimes(7);
  send({phase:"start",columns:80,rows:24});expect(terminal.cols).toBe(120);
});
