import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FileBrowserPane } from "../files/FileBrowserPane";
import { GitPane } from "../git/GitPane";
import { NetworkPane } from "../network/NetworkPane";
import { isDemo } from "../lib/runtime/environment";
import { getDemoProject, resetDemoProjects } from "./demoProject";
import { resetDemoNetwork } from "./services/network";
import { listNetworkRules } from "./services/network";
import { DEMO_HOME, demoProfiles } from "./fixtures";

const native = vi.hoisted(() => ({ invoke: vi.fn(() => { throw new Error("Native IPC must not run in demo"); }) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: native.invoke, Channel: class {} }));
// Editor DOM geometry is browser-owned; real CodeMirror is exercised in browser QA.
vi.mock("../files/CodeEditor", () => ({ CodeEditor: ({ value, readOnly, onChange }: { value: string; readOnly: boolean; onChange: (value: string) => void }) => <textarea aria-label="共享编辑器" value={value} readOnly={readOnly} onChange={event => onChange(event.target.value)}/> }));
const runtime = { sessionId: null, kind: "local" as const, status: "connected" as const, hostKeyPrompt: null, notice: "", connectionProgress: null };
afterEach(() => { cleanup(); resetDemoProjects(); resetDemoNetwork(); expect(native.invoke).not.toHaveBeenCalled(); native.invoke.mockClear(); });

it.runIf(isDemo)("uses the product document view, search, dirty guard and save confirmation", async () => {
  const pane = render(<FileBrowserPane initialPath={DEMO_HOME} runtime={runtime} onPathChange={vi.fn()}/>);
  fireEvent.keyDown(await screen.findByRole("listitem", { name: "README.md" }), { key: "Enter" });
  expect(await screen.findByRole("heading", { name: "Qterm demo" })).toBeInTheDocument();
  expect(screen.queryByRole("list", { name: `文件夹 ${DEMO_HOME}` })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "搜索当前文件" }));
  expect(screen.getByRole("searchbox", { name: "搜索内容" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "编辑" }));
  fireEvent.change(await screen.findByRole("textbox", { name: "共享编辑器" }), { target: { value: "# Shared editor\n" } });
  fireEvent.click(screen.getByRole("button", { name: "返回文件夹" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("未保存");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "确认覆盖" }));
  await waitFor(() => expect(getDemoProject(null).read(`${DEMO_HOME}/README.md`).content).toBe("# Shared editor\n"));
  pane.unmount();
  render(<GitPane blockId="git-demo" target={{ type: "local", path: DEMO_HOME }} visible onTargetChange={vi.fn()}/>);
  expect(await screen.findByRole("textbox", { name: /提交/ })).toBeInTheDocument();
  expect(screen.getAllByText("README.md").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "暂存全部更改" }));
  await waitFor(() => expect(getDemoProject(null).changes().every(change => change.staged)).toBe(true));
  fireEvent.change(screen.getByRole("textbox", { name: "提交消息" }), { target: { value: "shared UI commit" } });
  fireEvent.click(await screen.findByRole("button", { name: /提交.*项/ }));
  await waitFor(() => expect(getDemoProject(null).changes()).toEqual([]));
});

it.runIf(isDemo)("uses the product Network creation dialog with simulated services", async () => {
  const start = vi.fn(); const stop = vi.fn();
  const pane = render(<NetworkPane profileId={demoProfiles[0].id} onStart={start} onStop={stop}/>);
  expect(screen.getByRole("note")).toHaveTextContent("没有建立真实隧道");
  fireEvent.click(screen.getByRole("button", { name: "创建网络实例" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("SOCKS5");
  fireEvent.click(screen.getByRole("button", { name: /^SOCKS5/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "名称" }), { target: { value: "Shared SOCKS" } });
  fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
  fireEvent.click(await screen.findByRole("switch", { name: "启动 Shared SOCKS" }));
  expect(start).toHaveBeenCalledOnce();
  const [rule] = await listNetworkRules(demoProfiles[0].id);
  pane.rerender(<NetworkPane profileId={demoProfiles[0].id} onStart={start} onStop={stop} runtimeStates={{ [rule.id]: "running" }}/>);
  fireEvent.click(screen.getByRole("switch", { name: "停止 Shared SOCKS" })); expect(stop).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "打开 Shared SOCKS 代理工具" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("note")).toHaveTextContent("没有建立真实代理");
  await waitFor(() => expect(within(dialog).getByRole("button", { name: /Google Chrome/ })).toBeDisabled());
});
