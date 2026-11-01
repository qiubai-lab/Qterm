import { beforeEach, expect, it, vi } from "vitest";
import { startClipboard, cancelClipboard } from "./terminalClipboard";
const mocks=vi.hoisted(()=>({upload:vi.fn(),api:vi.fn()}));
vi.mock("./uploadRequest",()=>({uploadRequest:mocks.upload}));
vi.mock("./http",()=>({api:mocks.api}));
beforeEach(()=>{vi.clearAllMocks();mocks.api.mockResolvedValue(null);});
it("uses paste event files before text and returns paths only after uploading",async()=>{
  let finish!:(value:unknown)=>void;
  mocks.upload.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const events=vi.fn(),file=new File(["content"],"note.txt");
  expect(await startClipboard("local-terminal",events,{files:[file],text:"ignored"})).toMatchObject({kind:"transfer"});
  expect(events).toHaveBeenCalledWith({type:"started",totalBytes:7,itemCount:1,displayName:"note.txt"});
  expect(events).not.toHaveBeenCalledWith(expect.objectContaining({type:"completed"}));
  finish({remotePaths:["'/server/note.txt'"]});await Promise.resolve();
  expect(events).toHaveBeenLastCalledWith({type:"completed",remotePaths:["'/server/note.txt'"]});
});
it("passes event text through without needing clipboard permissions",async()=>{
  expect(await startClipboard("ssh",vi.fn(),{files:[],text:"echo test"})).toEqual({kind:"text",text:"echo test"});
  expect(mocks.upload).not.toHaveBeenCalled();
});
it("cancels the correct task and suppresses a racing completion",async()=>{
  let finish!:(value:unknown)=>void;
  mocks.upload.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const events=vi.fn(),result=await startClipboard("ssh",events,{files:[new File(["x"],"x")],text:""});
  if(result.kind!=="transfer")throw new Error("expected transfer");
  await cancelClipboard("other",result.taskId);expect(mocks.api).not.toHaveBeenCalled();
  await cancelClipboard("ssh",result.taskId);expect(mocks.upload.mock.calls[0][4].aborted).toBe(true);
  finish({remotePaths:["unsafe-after-cancel"]});await Promise.resolve();
  expect(events).toHaveBeenLastCalledWith({type:"cancelled"});
});
