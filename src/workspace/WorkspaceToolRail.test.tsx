import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createWorkspaceDocument } from "./model";
import { findLeaf } from "./layout";
import { workspaceReducer } from "./reducer";
import { WorkspaceToolRail } from "./WorkspaceToolRail";

const mocks = vi.hoisted(() => ({ supported: vi.fn(), dispatch: vi.fn() }));
let document = createWorkspaceDocument();
vi.mock("../web/webModel", async original => ({ ...await original<object>(), supportsWebBlocks: mocks.supported }));
vi.mock("./WorkspaceProvider", () => ({ useWorkspace: () => ({
  activeWorkspace: document.workspaces[0], runtimes: {}, dispatch: mocks.dispatch, splitTerminalBlock: vi.fn(),
}) }));

beforeEach(() => {
  document = createWorkspaceDocument();
  mocks.supported.mockReturnValue(true);
  mocks.dispatch.mockReset();
  mocks.dispatch.mockImplementation(action => { document = workspaceReducer(document, action); });
});
afterEach(cleanup);

it("opens a local browser beside the active remote terminal and preserves that terminal", async () => {
  const workspace = document.workspaces[0];
  if (workspace.layout.type !== "terminal") throw new Error("Expected initial terminal");
  workspace.layout.profileId = "remote-server";
  const terminal = workspace.layout;
  render(<WorkspaceToolRail controls={{}} remoteShellIntegrationEnabled={false}/>);
  const browser = screen.getByRole("button", { name: "浏览器" });
  expect(browser.querySelector('[data-icon="browser"]')).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "打开终端" }).nextElementSibling).toBe(browser);
  await userEvent.click(browser);
  const updated = document.workspaces[0];
  expect(findLeaf(updated.layout, terminal.blockId)).toEqual(terminal);
  expect(findLeaf(updated.layout, updated.activeBlockId)).toMatchObject({ type: "web", profileId: null });
});

it("supports opening the browser using the keyboard", async () => {
  render(<WorkspaceToolRail controls={{}} remoteShellIntegrationEnabled={false}/>);
  screen.getByRole("button", { name: "浏览器" }).focus();
  await userEvent.keyboard("{Enter}");
  const workspace = document.workspaces[0];
  expect(findLeaf(workspace.layout, workspace.activeBlockId)?.type).toBe("web");
});

it("disables the browser with a platform notice when native browsing is unavailable", async () => {
  mocks.supported.mockReturnValue(false);
  render(<WorkspaceToolRail controls={{}} remoteShellIntegrationEnabled={false}/>);
  const browser = screen.getByRole("button", { name: "浏览器" });
  expect(browser).toBeDisabled();
  expect(browser).toHaveAttribute("title", "内部浏览器需要 Windows 或 macOS 14 及以上桌面版");
  await userEvent.click(browser);
  expect(mocks.dispatch).not.toHaveBeenCalled();
});
