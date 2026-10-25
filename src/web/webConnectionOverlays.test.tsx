import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HostIdentity } from "../components/HostIdentity";
import { TerminalTargetPicker } from "../workspace/TerminalTargetPicker";
import { webSurfaceVisible } from "./webModel";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";
import { webSurfacePanels } from "./webSurfacePanels";

const native = vi.hoisted(() => ({ listeners: new Set<(label: string) => void>() }));
vi.mock("../lib/tauri/web", () => ({ listenWebFocus: vi.fn(async (receive: (label: string) => void) => {
  native.listeners.add(receive); return () => { native.listeners.delete(receive); };
}) }));
vi.mock("@qterm/services/textClipboard", () => ({ writeText: vi.fn(async () => {}) }));
const profile = { id: "profile", name: "Server", host: "server.test", username: "user", port: 22,
  authPreference: "sshAgent" as const, credentialId: null, groupId: "group" };
const surface = new DOMRect(0, 80, 700, 500);
afterEach(() => { cleanup(); native.listeners.clear(); vi.restoreAllMocks(); });

function geometry(node: HTMLElement, rect: DOMRect) {
  node.style.cssText = "border:1px solid rgb(25,27,31);border-top-left-radius:8px;background:rgb(25,27,31);--web-native-overlay-stroke:rgba(0,221,235,.38)";
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue(rect);
}
async function focusPage() {
  await act(async () => { native.listeners.forEach(receive => receive("web-fixture")); });
}

it("keeps native pages visible around the real host summary and dismisses it on native page focus", async () => {
  render(<HostIdentity profile={profile}/>);
  fireEvent.click(screen.getByRole("button", { name: /查看 Server 主机概要/ }));
  const panel = screen.getByRole("dialog", { name: "Server" });
  geometry(panel, new DOMRect(120, 55, 300, 205));
  expect(webSurfaceVisible(document.body, true)).toBe(true);
  expect(webSurfacePanels(surface)).toHaveLength(2);
  expect(webSurfaceOcclusions(surface).length).toBeGreaterThan(0);
  expect(webSurfaceOcclusions(new DOMRect(800, 80, 700, 500))).toEqual([]);
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await focusPage();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(webSurfaceOcclusions(surface)).toEqual([]);
  expect(webSurfacePanels(surface)).toEqual([]);
  expect(focus).not.toHaveBeenCalled();
});

it("clips the real connection picker and group submenu locally while retaining genuine modal blocking", async () => {
  const onSelect = vi.fn();
  render(<TerminalTargetPicker profiles={[profile]} groups={[{ id: "group", name: "Servers" }]}
    recentProfileIds={[profile.id]} selectedProfileId={profile.id} status="connected" detail="user@server.test" onSelect={onSelect}/>);
  fireEvent.click(screen.getByRole("button", { name: "选择终端连接，当前：Server" }));
  fireEvent.click(screen.getByRole("button", { name: /Servers/ }));
  geometry(screen.getByRole("dialog", { name: "选择终端连接" }), new DOMRect(40, 40, 292, 320));
  geometry(screen.getByRole("dialog", { name: "Servers连接" }), new DOMRect(340, 180, 260, 120));
  expect(webSurfaceVisible(document.body, true)).toBe(true);
  expect(webSurfacePanels(surface)).toHaveLength(4);
  const cuts = webSurfaceOcclusions(surface);
  expect(cuts.some(cut => cut.x < 332)).toBe(true);
  expect(cuts.some(cut => cut.x >= 340)).toBe(true);
  expect(cuts.every(cut => cut.x + cut.width <= 600 && cut.y + cut.height <= 280)).toBe(true);
  const modal = document.createElement("div"); modal.setAttribute("role", "dialog"); document.body.append(modal);
  expect(webSurfaceVisible(document.body, true)).toBe(false);
  modal.remove();
  expect(webSurfaceVisible(document.body, true)).toBe(true);
  await focusPage();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  expect(webSurfaceOcclusions(surface)).toEqual([]);
});
