import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useRetainedFilePreview } from "./useRetainedFilePreview";
import { defaultFileRuntime } from "../workspace/workspaceRuntime";
import type { FilePreviewState } from "./FilePreviewDocument";
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("../lib/runtime/environment", () => ({ isServer: true }));
vi.mock("@qterm/services/paneState", () => ({ loadPaneState: mocks.load, savePaneState: mocks.save }));
const draft = { entry: {path:"/notes.txt",name:"notes.txt",isDirectory:false},content:"unsaved",original:"original",revision:"disk-version",kind:"text",mode:"edit",loading:false,error:"",imageUrl:"" } as FilePreviewState;
beforeEach(() => { mocks.load.mockReset().mockResolvedValue(draft); mocks.save.mockReset().mockResolvedValue(undefined); });
it("restores an unsaved document without overwriting it with initial empty browser state",async()=>{
  const view=renderHook(()=>useRetainedFilePreview("block:local",defaultFileRuntime));
  await waitFor(()=>expect(view.result.current[0]?.content).toBe("unsaved"));
  expect(view.result.current[0]?.revision).toBe("disk-version");
  expect(mocks.save).not.toHaveBeenCalled();
  act(()=>view.result.current[1](current=>({...current!,content:"edited again"})));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledWith("block:local",expect.objectContaining({content:"edited again"})));
});
it("a failed restore never clears the server draft and exposes the error",async()=>{
  mocks.load.mockRejectedValue(new Error("offline"));
  const view=renderHook(()=>useRetainedFilePreview("block:local",defaultFileRuntime));
  await waitFor(()=>expect(view.result.current[2]).toContain("未能恢复"));
  expect(mocks.save).not.toHaveBeenCalled();
});
it("serializes updates and keeps the latest edit while an earlier save is in flight",async()=>{
  let release!:()=>void;
  mocks.save.mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve;}));
  const view=renderHook(()=>useRetainedFilePreview("block:local",defaultFileRuntime));
  await waitFor(()=>expect(view.result.current[0]).not.toBeNull());
  act(()=>view.result.current[1](current=>({...current!,content:"first"})));
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
  act(()=>view.result.current[1](current=>({...current!,content:"second"})));
  act(()=>view.result.current[1](current=>({...current!,content:"latest"})));
  expect(mocks.save).toHaveBeenCalledTimes(1);
  await act(async()=>release());
  await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls[1][1].content).toBe("latest");
});
