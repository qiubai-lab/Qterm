import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTerminalLock, type TerminalLockBackend } from "./useTerminalLock";

afterEach(cleanup);

function deferred() {
  let resolve!: (state: { locked: boolean }) => void;
  const promise = new Promise<{ locked: boolean }>(done => { resolve = done; });
  return { promise, resolve };
}

function backend(initiallyLocked = false) {
  let locked = initiallyLocked;
  return {
    read: vi.fn(async () => ({ locked })),
    lock: vi.fn(async () => { locked = true; return { locked }; }),
    unlock: vi.fn(async () => { locked = false; return { locked }; }),
  } satisfies TerminalLockBackend;
}

it("blocks the first render and restores the same Web lock after remounting", async () => {
  const server = backend();
  const view = renderHook(() => useTerminalLock(server));
  expect(view.result.current.locked).toBe(true);
  expect(view.result.current.checking).toBe(true);
  await waitFor(() => expect(view.result.current.locked).toBe(false));
  await act(() => view.result.current.lock(true));
  expect(view.result.current.locked).toBe(true);
  view.unmount();
  const resumed = renderHook(() => useTerminalLock(server));
  expect(resumed.result.current.locked).toBe(true);
  await waitFor(() => expect(resumed.result.current.checking).toBe(false));
  expect(resumed.result.current.locked).toBe(true);
  await act(() => resumed.result.current.unlock("test-master-password"));
  expect(resumed.result.current.locked).toBe(false);
});

it("keeps the workbench covered when restoration fails and supports retry", async () => {
  const server = backend(true);
  server.read.mockRejectedValueOnce(new Error("offline"));
  const view = renderHook(() => useTerminalLock(server));
  await waitFor(() => expect(view.result.current.error).toContain("请重试"));
  expect(view.result.current.locked).toBe(true);
  await act(() => view.result.current.restore());
  expect(view.result.current.error).toBe("");
  expect(view.result.current.checking).toBe(false);
  expect(view.result.current.locked).toBe(true);
});

it("does not allow a late restoration response to undo a new lock", async () => {
  const pending = deferred();
  const server = backend();
  server.read.mockReturnValueOnce(pending.promise);
  const view = renderHook(() => useTerminalLock(server));
  await waitFor(() => expect(server.read).toHaveBeenCalledOnce());
  await act(() => view.result.current.lock(false));
  await act(async () => { pending.resolve({ locked: false }); });
  expect(view.result.current.locked).toBe(true);
});

it("does not start an initial read after a newer lock operation has begun", async () => {
  const server = backend();
  const view = renderHook(() => useTerminalLock(server));
  await act(() => view.result.current.lock(false));
  expect(server.read).not.toHaveBeenCalled();
  expect(view.result.current.locked).toBe(true);
});

it("reconciles a failed lock response and stays covered when its status is unknown", async () => {
  const server = backend();
  const view = renderHook(() => useTerminalLock(server));
  await waitFor(() => expect(view.result.current.locked).toBe(false));
  server.lock.mockRejectedValueOnce(new Error("lost response"));
  server.read.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { await expect(view.result.current.lock(true)).rejects.toThrow("lost response"); });
  expect(view.result.current.locked).toBe(true);
  expect(view.result.current.error).toContain("请重试");
  server.read.mockResolvedValueOnce({ locked: true });
  await act(() => view.result.current.restore());
  expect(view.result.current.locked).toBe(true);
  expect(view.result.current.checking).toBe(false);
});

it("retains the lock after an invalid password and allows a later successful unlock", async () => {
  const server = backend(true);
  const view = renderHook(() => useTerminalLock(server));
  await waitFor(() => expect(view.result.current.checking).toBe(false));
  server.unlock.mockRejectedValueOnce(new Error("密码不正确"));
  await act(async () => { await expect(view.result.current.unlock("wrong-password")).rejects.toThrow("密码不正确"); });
  expect(view.result.current.locked).toBe(true);
  await act(() => view.result.current.unlock("test-master-password"));
  expect(view.result.current.locked).toBe(false);
});
