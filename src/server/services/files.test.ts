import { afterEach, expect, it, vi } from "vitest";
import { pauseData, resumeData } from "../dataAccess";
import { readBinaryFile } from "./files";

afterEach(()=>{resumeData();vi.unstubAllGlobals();});
it("does not expose binary contents whose body finishes after a lock/unlock cycle",async()=>{
  let finish!:(value:ArrayBuffer)=>void;
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,status:200,arrayBuffer:()=>new Promise(resolve=>{finish=resolve;})}));
  const pending=readBinaryFile(null,"/test.png");const rejected=expect(pending).rejects.toThrow("终端已锁定");
  await vi.waitFor(()=>expect(finish).toBeTypeOf("function"));
  pauseData();resumeData();finish(new ArrayBuffer(8));await rejected;
});
