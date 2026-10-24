import { act, renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useWebBrowser } from "./useWebBrowser";

const ipc = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(async () => {}), sync: vi.fn(async () => {}), action: vi.fn(async () => {}), listen: vi.fn(async () => () => {}), focus: vi.fn<(receive: (label: string) => void) => Promise<() => void>>(async () => () => {}) }));
vi.mock("../lib/tauri/web", () => ({ openWeb: ipc.open, closeWeb: ipc.close, syncWeb: ipc.sync, webAction: ipc.action, listenWebPages: ipc.listen, listenWebFocus: ipc.focus }));
beforeEach(() => { vi.clearAllMocks(); ipc.open.mockResolvedValue(undefined); });

it("activates only its visible live guest on native focus and removes the listener on close", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const surface = { current: element };
  const activate = vi.fn(), unlisten = vi.fn();
  ipc.focus.mockResolvedValueOnce(unlisten);
  const hook = renderHook(({ visible }) => useWebBrowser(surface, "ssh", "profile", visible, activate), { initialProps: { visible: true } });
  await act(() => hook.result.current.navigate("http://remote.internal"));
  await waitFor(() => expect(ipc.open).toHaveBeenCalledOnce());
  const receive = ipc.focus.mock.calls[0][0], label = `web-${ipc.open.mock.calls[0][0]}`;
  act(() => receive("web-another"));
  expect(activate).not.toHaveBeenCalled();
  act(() => receive(label));
  expect(activate).toHaveBeenCalledOnce();
  hook.rerender({ visible: false });
  act(() => receive(label));
  expect(activate).toHaveBeenCalledOnce();
  hook.unmount();
  await waitFor(() => expect(unlisten).toHaveBeenCalledOnce());
  receive(label);
  expect(activate).toHaveBeenCalledOnce();
  element.remove();
});

it("closes a late native creation after the block unmounts", async () => {
  let finish!: () => void;
  ipc.open.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const surface = createRef<HTMLDivElement>();
  const hook = renderHook(() => useWebBrowser(surface, "ssh", "profile", true));
  await act(() => hook.result.current.navigate("http://remote.internal"));
  await waitFor(() => expect(ipc.open).toHaveBeenCalledOnce());
  const id = ipc.open.mock.calls[0][0];
  hook.unmount();
  await act(async () => { finish(); });
  await waitFor(() => expect(ipc.close).toHaveBeenCalledWith(id));
});

it("does not create a guest before authentication and closes it when the SSH session disappears", async () => {
  const surface = createRef<HTMLDivElement>();
  const hook = renderHook(({ session }: { session: string | null }) => useWebBrowser(surface, session, "profile", true), { initialProps: { session: null } as { session: string | null } });
  await act(() => hook.result.current.navigate("http://127.0.0.1:3000"));
  expect(ipc.open).not.toHaveBeenCalled();
  hook.rerender({ session: "ssh" });
  await waitFor(() => expect(ipc.open).toHaveBeenCalledOnce());
  hook.rerender({ session: null });
  await waitFor(() => expect(ipc.close).toHaveBeenCalledOnce());
  hook.unmount();
});

it("reopens the latest address after reconnecting and rejects privileged URLs", async () => {
  const surface = createRef<HTMLDivElement>();
  const hook = renderHook(({ session }: { session: string | null }) => useWebBrowser(surface, session, "profile", true), { initialProps: { session: "ssh" } as { session: string | null } });
  await act(async () => { expect(await hook.result.current.navigate("file:///secret")).toBe(false); });
  expect(ipc.open).not.toHaveBeenCalled();
  await act(() => hook.result.current.navigate("http://first.internal"));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(() => hook.result.current.navigate("http://second.internal"));
  expect(ipc.action).toHaveBeenCalledWith(expect.any(String), "navigate", "http://second.internal/");
  hook.rerender({ session: null });
  await waitFor(() => expect(hook.result.current.ready).toBe(false));
  hook.rerender({ session: "reconnected" });
  await waitFor(() => expect(ipc.open).toHaveBeenLastCalledWith(expect.any(String), "reconnected", "profile", "http://second.internal/"));
  hook.unmount();
});
