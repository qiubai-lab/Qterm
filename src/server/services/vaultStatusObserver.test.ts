import { afterEach, expect, it, vi } from "vitest";
import { createVaultStatusObserver } from "./vaultStatusObserver";
const locked={initialized:true,unlocked:false,legacy:false},unlocked={...locked,unlocked:true};
afterEach(()=>vi.useRealTimers());
it("uses initial state as a baseline and never polls unchanged state",async()=>{
  vi.useFakeTimers();const load=vi.fn().mockResolvedValue(locked),listener=vi.fn();
  const observer=createVaultStatusObserver(load);observer.subscribe(listener);
  observer.receive({...locked,revision:1,reason:"manual"});
  expect(await observer.read()).toEqual(locked);
  await vi.advanceTimersByTimeAsync(60000);
  expect(load).not.toHaveBeenCalled();expect(listener).not.toHaveBeenCalled();
  observer.receive({...unlocked,revision:2,reason:"manual"});
  observer.receive({...unlocked,revision:2,reason:"manual"});
  observer.receive({...locked,revision:1,reason:"manual"});
  expect(listener).toHaveBeenCalledExactlyOnceWith({...unlocked,reason:"manual"});
});
it("shares one fallback read and rejects stale HTTP state after a pushed lock",async()=>{
  let resolve!:(value:typeof unlocked)=>void;
  const load=vi.fn(()=>new Promise<typeof unlocked>(done=>{resolve=done;}));
  const observer=createVaultStatusObserver(load),listener=vi.fn();observer.subscribe(listener);
  const first=observer.read(),second=observer.read();expect(load).toHaveBeenCalledOnce();
  observer.receive({...unlocked,revision:1,reason:"manual"});
  observer.receive({...locked,revision:2,reason:"timeout"});
  resolve(unlocked);expect(await first).toEqual(locked);expect(await second).toEqual(locked);
  expect(listener).toHaveBeenCalledExactlyOnceWith({...locked,reason:"timeout"});
});
it("reconciles a reconnect or server restart without treating its baseline as a repeated event",()=>{
  const observer=createVaultStatusObserver(vi.fn()),listener=vi.fn();observer.subscribe(listener);
  observer.receive({...unlocked,revision:50,reason:"manual"});observer.beginConnection();
  observer.receive({...unlocked,revision:1,reason:"manual"});expect(listener).not.toHaveBeenCalled();
  observer.receive({...locked,revision:2,reason:"timeout"});expect(listener).toHaveBeenCalledOnce();
});
it("defers notifications during terminal lock and synchronizes the latest state on resume",()=>{
  let paused=false,changed=()=>{};
  const observer=createVaultStatusObserver(vi.fn(),{paused:()=>paused,subscribe:fn=>{changed=fn;return()=>{};}}),listener=vi.fn();observer.subscribe(listener);
  observer.receive({...unlocked,revision:1,reason:"manual"});paused=true;
  observer.receive({...locked,revision:2,reason:"timeout"});expect(listener).not.toHaveBeenCalled();
  paused=false;changed();expect(listener).toHaveBeenCalledExactlyOnceWith({...locked,reason:"timeout"});
  observer.dispose();
});
it("does not emit unchanged explicit action results or malformed messages",async()=>{
  const observer=createVaultStatusObserver(vi.fn().mockResolvedValue(locked)),listener=vi.fn();observer.subscribe(listener);
  await observer.read();await observer.refreshAfterMutation();
  observer.receive({...unlocked,revision:"3",reason:"manual"});observer.receive({...unlocked,revision:4,reason:"other"});
  expect(listener).not.toHaveBeenCalled();
});
