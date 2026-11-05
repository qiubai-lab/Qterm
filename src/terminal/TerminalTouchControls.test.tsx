import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserInterfaceContext, defaults } from "../browser/browserInterfaceContext";
import { TerminalTouchControls } from "./TerminalTouchControls";
import type { TerminalView } from "./terminalView";
const clipboard=vi.hoisted(()=>({write:vi.fn()}));
vi.mock("@qterm/services/textClipboard",()=>({writeText:clipboard.write}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup(enabled=true,showKeybar=true) {
  const send=vi.fn().mockResolvedValue(undefined), paste=vi.fn().mockResolvedValue(undefined);
  const terminal={focus:vi.fn(),selectAll:vi.fn(),modes:{applicationCursorKeysMode:false},buffer:{active:{length:1,getLine:()=>({translateToString:()=>"hello",isWrapped:false})}}};
  const viewRef={current:{terminal,inputScheduler:{send}} as unknown as TerminalView};
  const renderControls=(active:boolean)=> <BrowserInterfaceContext value={{enabled:true,touch:true,showKeybar,preferences:defaults,update:vi.fn()}}><TerminalTouchControls viewRef={viewRef} enabled={active} paste={paste}/></BrowserInterfaceContext>;
  const view=render(renderControls(enabled));
  return {send,paste,terminal,view,renderControls};
}
it("sends control keys through ordered input and respects application cursor mode",async()=>{
  const {send,terminal}=setup();
  fireEvent.click(screen.getByRole("button",{name:"Ctrl+C"}));
  fireEvent.click(screen.getByRole("button",{name:"Esc"}));
  fireEvent.click(screen.getByRole("button",{name:"上方向键"}));
  terminal.modes.applicationCursorKeysMode=true;
  fireEvent.click(screen.getByRole("button",{name:"左方向键"}));
  expect(send.mock.calls.map(call=>call[0])).toEqual(["\x03","\x1b","\x1b[A","\x1bOD"]);
  expect(terminal.focus).toHaveBeenCalledTimes(4);
});
it("disables writes while disconnected without disabling text selection",()=>{
  const {send,paste}=setup(false);
  fireEvent.click(screen.getByRole("button",{name:"Ctrl+D"}));
  fireEvent.click(screen.getByRole("button",{name:"粘贴"}));
  expect(send).not.toHaveBeenCalled();expect(paste).not.toHaveBeenCalled();
  expect(screen.getByRole("button",{name:"选择"})).toBeEnabled();
});
it("uses the guarded paste callback and supports a selectable read-only snapshot",async()=>{
  const {paste}=setup();
  fireEvent.click(screen.getByRole("button",{name:"粘贴"}));
  expect(paste).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"选择"}));
  const field=screen.getByRole("textbox",{name:"终端文字快照"}) as HTMLTextAreaElement;
  expect(field).toHaveAttribute("readonly");expect(field.value).toBe("hello");
  field.setSelectionRange(1,4);
  clipboard.write.mockResolvedValue(undefined);
  fireEvent.click(screen.getByRole("button",{name:"复制所选文字"}));
  await waitFor(()=>expect(clipboard.write).toHaveBeenCalledWith("ell"));
  expect(await screen.findByRole("status")).toHaveTextContent("已复制");
});
it("does not render when the keybar preference is hidden",()=>{
  setup(true,false);expect(screen.queryByRole("group",{name:"终端快捷键"})).not.toBeInTheDocument();
});
