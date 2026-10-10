import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppThemeProvider } from "../../app/theme/AppThemeProvider";
import { TerminalTitleProvider } from "../../terminal/TerminalTitleProvider";
import { TerminalHeaderMetadata } from "../../terminal/TerminalHeaderMetadata";
import { SettingsDialog } from "./SettingsDialog";

const mocks = vi.hoisted(() => ({ getSettings: vi.fn(), updateTerminalSettings: vi.fn() }));
vi.mock("../../lib/tauri/settings", () => mocks);
vi.mock("../../terminal/useTerminalActivity", () => ({ useTerminalActivity: () => ({ title: "Codex", progress: { state: "running", value: 42 } }) }));
let terminal = { remoteShellIntegrationEnabled: false, commandMarkersEnabled: false, historyFreeBashEnabled: false, applicationTitleEnabled: false };
const snapshot = () => ({ general: { rootDirectory: "/test" }, security: {}, appearance: { theme: "dark" }, terminal, warning: null });
beforeEach(() => {
  terminal = { remoteShellIntegrationEnabled: false, commandMarkersEnabled: false, historyFreeBashEnabled: false, applicationTitleEnabled: false };
  mocks.getSettings.mockImplementation(async () => snapshot());
  mocks.updateTerminalSettings.mockImplementation(async patch => { terminal = { ...terminal, ...patch }; return snapshot(); });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
async function open() {
  render(<AppThemeProvider><TerminalTitleProvider>
    <TerminalHeaderMetadata blockId="one" sessionKey="one" connected/>
    <TerminalHeaderMetadata blockId="two" sessionKey="two" connected/>
    <SettingsDialog onClose={() => undefined}/>
  </TerminalTitleProvider></AppThemeProvider>);
  await userEvent.click(screen.getByRole("button", { name: /高级/ }));
  return screen.findByRole("switch", { name: "显示应用标题" });
}
it("defaults off, updates all current terminals immediately, and restores the saved setting", async () => {
  const toggle = await open();
  expect(toggle).not.toBeChecked();
  expect(screen.queryByLabelText("应用标题：Codex")).not.toBeInTheDocument();
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  await userEvent.click(toggle);
  await waitFor(() => expect(screen.getAllByLabelText("应用标题：Codex")).toHaveLength(2));
  expect(mocks.updateTerminalSettings).toHaveBeenLastCalledWith({ applicationTitleEnabled: true });
  expect(screen.getByRole("switch", { name: "OSC 133 命令导航" })).not.toBeChecked();
  cleanup();
  const restored = await open();
  expect(restored).toBeChecked();
  await userEvent.click(restored);
  await waitFor(() => expect(screen.queryByLabelText("应用标题：Codex")).not.toBeInTheDocument());
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
});
it("disables the switch during save and retains the preference on failure", async () => {
  const toggle = await open();
  let reject!: (error: Error) => void;
  mocks.updateTerminalSettings.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await userEvent.click(toggle);
  expect(toggle).toBeDisabled();
  reject(new Error("标题设置保存失败"));
  expect(await screen.findByRole("alert")).toHaveTextContent("标题设置保存失败");
  expect(toggle).not.toBeChecked();
  expect(toggle).toBeEnabled();
  expect(screen.queryByLabelText("应用标题：Codex")).not.toBeInTheDocument();
});
