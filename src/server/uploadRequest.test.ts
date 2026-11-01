import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { uploadRequest } from "./uploadRequest";
const api = vi.hoisted(()=>vi.fn());
vi.mock("./http",async original=>({...await original<typeof import("./http")>(),api}));
class Xhr {
  static last: Xhr;
  upload={onprogress:null as null|((event:ProgressEvent)=>void),onload:null as null|(()=>void)};
  status=200;responseText='{"ok":true}';
  onload=()=>{};onerror=()=>{};onabort=()=>{};ontimeout=()=>{};
  open=vi.fn();setRequestHeader=vi.fn();send=vi.fn();abort=vi.fn(()=>this.onabort());
  constructor(){Xhr.last=this;}
}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal("XMLHttpRequest",Xhr);api.mockResolvedValue({transferredBytes:50});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it("reports live upload and target progress, reserving completion for the HTTP acknowledgment",async()=>{
  const progress=vi.fn(), abort=new AbortController();
  const promise=uploadRequest("/upload",new FormData(),"task",100,abort.signal,progress);
  const xhr=Xhr.last;
  xhr.upload.onprogress!({lengthComputable:true,loaded:50,total:100} as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith(25);
  xhr.upload.onload!();await vi.advanceTimersByTimeAsync(0);
  expect(progress).toHaveBeenLastCalledWith(75);
  api.mockResolvedValue({transferredBytes:100});await vi.advanceTimersByTimeAsync(250);
  expect(progress).toHaveBeenLastCalledWith(99);
  xhr.onload();expect(await promise).toEqual({ok:true});expect(progress).toHaveBeenLastCalledWith(100);
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels transport and polling without delivering a late success",async()=>{
  const controller=new AbortController(),progress=vi.fn();
  const promise=uploadRequest("/upload",new FormData(),"task",100,controller.signal,progress);
  const rejected=expect(promise).rejects.toMatchObject({name:"AbortError"});
  controller.abort();Xhr.last.onload();await rejected;
  expect(Xhr.last.abort).toHaveBeenCalledOnce();expect(progress).not.toHaveBeenCalled();
});
it("does not report completion for a rejected upload",async()=>{
  const progress=vi.fn();const promise=uploadRequest("/upload",new FormData(),"task",100,new AbortController().signal,progress);
  const rejected=expect(promise).rejects.toMatchObject({status:403});
  Xhr.last.status=403;Xhr.last.responseText='{"message":"denied"}';Xhr.last.onload();await rejected;
  expect(progress).not.toHaveBeenCalledWith(100);
});

it("keeps a large file visibly below 100% until the server confirms success",async()=>{
  const progress=vi.fn(),size=64*1024*1024;
  api.mockResolvedValue({transferredBytes:size});
  const promise=uploadRequest("/upload",new FormData(),"task",size,new AbortController().signal,progress);
  Xhr.last.upload.onload!();await vi.advanceTimersByTimeAsync(0);
  expect(Math.round(progress.mock.lastCall![0]/size*100)).toBe(99);
  Xhr.last.onload();await promise;expect(progress).toHaveBeenLastCalledWith(size);
});
