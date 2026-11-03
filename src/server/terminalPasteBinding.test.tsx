import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useTerminalInputBindings } from "../terminal/useTerminalInputBindings";
import type { TerminalView } from "../terminal/terminalView";
vi.mock("../lib/runtime/environment",()=>({isServer:true,isRemoteDesktop:false}));
it("lets browser shortcuts deliver file paste events on Linux and snapshots their data",()=>{
  const element=document.createElement("div"),paste=vi.fn().mockResolvedValue(undefined);
  const view={element,terminal:{selectAll:vi.fn()},onKey:()=>true} as unknown as TerminalView;
  const ref={current:view};
  const {unmount}=renderHook(()=>useTerminalInputBindings(ref,"session","linux","linux",true,vi.fn(),paste,vi.fn()));
  const key=new KeyboardEvent("keydown",{key:"v",ctrlKey:true,shiftKey:true,cancelable:true});
  expect(view.onKey(key)).toBe(false);expect(key.defaultPrevented).toBe(false);expect(paste).not.toHaveBeenCalled();
  const file=new File(["proof"],"file.txt"),event=new Event("paste",{cancelable:true});
  Object.defineProperty(event,"clipboardData",{value:{files:[file],getData:()=>"text"}});
  element.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);expect(paste).toHaveBeenCalledWith({files:[file],text:"text"});
  unmount();element.dispatchEvent(new Event("paste"));expect(paste).toHaveBeenCalledOnce();
});
