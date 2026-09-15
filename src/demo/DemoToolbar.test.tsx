import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AppThemeProvider } from "../app/theme/AppThemeProvider";
import { createWorkspaceDocument } from "../workspace/model";
import { DemoToolbar } from "./DemoToolbar";
import { loadWorkspaces } from "./services/workspaces";
import { getSettings } from "./services/settings";

vi.mock("../workspace/WorkspaceProvider", () => ({ useWorkspace: () => {
  const activeWorkspace = createWorkspaceDocument().workspaces[0];
  return { activeWorkspace, activeBlockId: activeWorkspace.activeBlockId, dispatch: vi.fn() };
} }));
afterEach(() => { cleanup(); delete document.documentElement.dataset.theme; window.history.replaceState({}, "", "/"); });

it("starts on the developer profile with cyber theme and preserves an explicit local scene", async () => {
  const initial = await loadWorkspaces();
  expect(initial?.workspaces[0].layout).toMatchObject({ type: "terminal", profileId: "demo-development", restoreDirectory: "/home/demo/qterm" });
  expect((await getSettings()).appearance.theme).toBe("cyberpunk");
  window.history.replaceState({}, "", "/?scene=local");
  expect((await loadWorkspaces())?.workspaces[0].layout).toMatchObject({ type: "terminal", profileId: null });
});

it("moves theme selection and keyboard focus together, wrapping at the ends", () => {
  document.documentElement.dataset.theme = "cyberpunk";
  render(<AppThemeProvider><DemoToolbar/></AppThemeProvider>);
  const cyber = screen.getByRole("radio", { name: "赛博" });
  const dark = screen.getByRole("radio", { name: "深色" });
  const light = screen.getByRole("radio", { name: "浅色" });
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(cyber).toHaveAttribute("aria-checked", "true");
  fireEvent.keyDown(cyber, { key: "ArrowRight" });
  expect(dark).toHaveFocus();
  expect(document.documentElement.dataset.theme).toBe("dark");
  fireEvent.click(light);
  expect(light).toHaveAttribute("aria-checked", "true");
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.keyDown(light, { key: "End" });
  expect(cyber).toHaveFocus();
  expect(screen.getByRole("radiogroup")).toHaveStyle({ "--theme-index": "2" });
});
