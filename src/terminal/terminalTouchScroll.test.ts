import { expect, it, vi } from "vitest";
import { bindTerminalTouchScroll } from "./terminalTouchScroll";
it("scrolls history by lines without turning gestures into terminal input and leaves pinch zoom alone",()=>{
  const element=document.createElement("div");
  Object.defineProperty(element,"clientHeight",{value:400});
  const scrollLines=vi.fn();const stop=bindTerminalTouchScroll(element,{rows:20,scrollLines});
  const touch=(type:string,ys:number[])=>{
    const event=new Event(type,{cancelable:true,bubbles:true});
    Object.defineProperty(event,"touches",{value:ys.map(clientY=>({clientY}))});
    element.dispatchEvent(event);return event;
  };
  touch("touchstart",[200]);expect(touch("touchmove",[140]).defaultPrevented).toBe(true);
  expect(scrollLines).toHaveBeenCalledWith(3);
  expect(touch("touchmove",[120,180]).defaultPrevented).toBe(false);
  touch("touchmove",[80]);expect(scrollLines).toHaveBeenCalledTimes(1);
  touch("touchend",[]);stop();touch("touchstart",[200]);touch("touchmove",[100]);
  expect(scrollLines).toHaveBeenCalledTimes(1);
});
