import { act, renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { useWebBrowser } from "./useWebBrowser";
import type { WebPageState } from "../lib/tauri/web";

const ipc = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(async () => {}), sync: vi.fn(async () => {}), action: vi.fn(async () => {}), listen: vi.fn(async () => () => {}), focus: vi.fn<(receive: (label: string) => void) => Promise<() => void>>(async () => () => {}) }));
vi.mock("../lib/tauri/web", () => ({ openWeb: ipc.open, closeWeb: ipc.close, syncWeb: ipc.sync, webAction: ipc.action, listenWebPages: ipc.listen, listenWebFocus: ipc.focus, readWebMetrics: vi.fn(async () => null) }));
beforeEach(() => { vi.clearAllMocks(); ipc.open.mockResolvedValue(undefined); });

it("hides inactive tabs once without measuring their surface and resumes the same guest", async () => {
  let nextFrame!: FrameRequestCallback;
  const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { nextFrame = callback; return 1; });
  const element = document.createElement("div"); document.body.append(element);
  const measure = vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 400, 300));
  const surface = { current: element };
  const hook = renderHook(({ visible }) => useWebBrowser(surface, "ssh", "profile", visible), { initialProps: { visible: false } });
  try {
    await act(() => hook.result.current.navigate("https://internal.invalid"));
    await waitFor(() => expect(ipc.sync).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ visible: false })));
    const count = ipc.sync.mock.calls.length;
    await act(async () => nextFrame(0)); await act(async () => nextFrame(1));
    expect(measure).not.toHaveBeenCalled(); expect(ipc.sync).toHaveBeenCalledTimes(count);
    hook.rerender({ visible: true }); await act(async () => nextFrame(2));
    expect(measure).toHaveBeenCalled(); expect(ipc.open).toHaveBeenCalledOnce();
  } finally { hook.unmount(); element.remove(); frame.mockRestore(); }
});

it("resynchronizes the palette after document navigation and theme changes with unchanged viewport bounds", async () => {
  let nextFrame!: FrameRequestCallback;
  const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => { nextFrame = callback; return 1; });
  let receive!: (page: WebPageState) => void;
  ipc.listen.mockImplementationOnce(((listener: (page: WebPageState) => void) => { receive = listener; return Promise.resolve(() => {}); }) as typeof ipc.listen);
  const element = document.createElement("div");
  document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 10, 400, 300));
  const surface = { current: element };
  const hook = renderHook(() => useWebBrowser(surface, "ssh", "profile", true));
  try {
    await act(() => hook.result.current.navigate("https://internal.invalid"));
    await waitFor(() => expect(ipc.sync).toHaveBeenCalled());
    const firstCount = ipc.sync.mock.calls.length;
    await act(async () => nextFrame(0));
    expect(ipc.sync).toHaveBeenCalledTimes(firstCount);
    act(() => receive({ label: `web-${ipc.open.mock.calls[0][0]}`, url: "https://internal.invalid/", loading: false, visited: true }));
    await act(async () => nextFrame(1));
    expect(ipc.sync).toHaveBeenCalledTimes(firstCount + 1);
    document.documentElement.style.setProperty("--terminal-scrollbar", "#102030ff");
    await act(async () => nextFrame(2));
    expect(ipc.sync).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ width: 400, height: 300, scrollbar: expect.arrayContaining([[11, 22, 34, 255]]) }));
  } finally {
    hook.unmount(); element.remove(); frame.mockRestore();
    document.documentElement.style.removeProperty("--terminal-scrollbar");
  }
});

it("records only completed live guest visits, including redirected URLs, and ignores late events", async () => {
  let receive!: (page: WebPageState) => void;
  ipc.listen.mockImplementationOnce(((listener: (page: WebPageState) => void) => { receive = listener; return Promise.resolve(() => {}); }) as typeof ipc.listen);
  const visited = vi.fn();
  const surface = createRef<HTMLDivElement>();
  const hook = renderHook(() => useWebBrowser(surface, "ssh", "profile", true, undefined, visited));
  await act(() => hook.result.current.navigate("https://start.internal"));
  await waitFor(() => expect(ipc.open).toHaveBeenCalledOnce());
  expect(visited).not.toHaveBeenCalled();
  const label = `web-${ipc.open.mock.calls[0][0]}`;
  act(() => receive({ label: "web-other", url: "https://other.internal/", loading: false, visited: true }));
  act(() => receive({ label, url: "https://start.internal/", loading: true, visited: false }));
  expect(visited).not.toHaveBeenCalled();
  expect(hook.result.current.loading).toBe(true);
  await act(() => hook.result.current.navigate("file:///invalid"));
  expect(hook.result.current.loading).toBe(true);
  await act(() => hook.result.current.action("stop"));
  expect(ipc.action).toHaveBeenCalledWith(expect.any(String), "stop");
  act(() => receive({ label, url: "https://start.internal/", loading: false, visited: false }));
  expect(hook.result.current.loading).toBe(false);
  expect(visited).not.toHaveBeenCalled();
  expect(ipc.close).not.toHaveBeenCalled();
  act(() => receive({ label, url: "https://final.internal/", loading: false, visited: true }));
  expect(visited).toHaveBeenCalledExactlyOnceWith("https://final.internal/", "", false);
  act(() => receive({ label, url: "https://final.internal/", loading: false, visited: false, metadata: true, title: "控制台" }));
  expect(hook.result.current.title).toBe("控制台");
  expect(visited).toHaveBeenLastCalledWith("https://final.internal/", "控制台", true);
  visited.mockClear();
  hook.unmount();
  receive({ label, url: "https://late.internal/", loading: false, visited: true });
  expect(visited).not.toHaveBeenCalled();
});

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

it("opens Local without an SSH session and never treats disconnected Remote as Local", async () => {
  const surface = createRef<HTMLDivElement>();
  const hook = renderHook(({ profileId, sessionId }) => useWebBrowser(surface, sessionId, profileId, true), {
    initialProps: { profileId: null as string | null, sessionId: null as string | null },
  });
  await act(() => hook.result.current.navigate("http://localhost:3000"));
  await waitFor(() => expect(ipc.open).toHaveBeenCalledWith(expect.any(String), null, null, "http://localhost:3000/"));
  expect(hook.result.current.ready).toBe(true);
  hook.rerender({ profileId: "remote", sessionId: null });
  await waitFor(() => expect(ipc.close).toHaveBeenCalledOnce());
  expect(hook.result.current.ready).toBe(false);
  expect(ipc.open).toHaveBeenCalledOnce();
  hook.unmount();
});
