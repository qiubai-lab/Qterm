import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalTitleProvider, useTerminalTitlePreference } from "./TerminalTitleProvider";

const mocks = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock("../lib/tauri/settings", () => mocks);
afterEach(() => { cleanup(); vi.resetAllMocks(); });
function Consumer() {
  const { enabled, applySettings } = useTerminalTitlePreference();
  return <button onClick={() => applySettings({ applicationTitleEnabled: true })}>{enabled ? "启用" : "关闭"}</button>;
}
it.each([{}, { applicationTitleEnabled: false }, { applicationTitleEnabled: true }])("loads the saved preference with a safe legacy default: %j", async terminal => {
  mocks.getSettings.mockResolvedValue({ terminal });
  render(<TerminalTitleProvider><Consumer/></TerminalTitleProvider>);
  expect(screen.getByRole("button")).toHaveTextContent("关闭");
  await act(async () => undefined);
  expect(screen.getByRole("button")).toHaveTextContent("applicationTitleEnabled" in terminal && terminal.applicationTitleEnabled ? "启用" : "关闭");
});
it("does not overwrite a settings update with an older startup read", async () => {
  let resolve!: (snapshot: unknown) => void;
  mocks.getSettings.mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<TerminalTitleProvider><Consumer/></TerminalTitleProvider>);
  fireEvent.click(screen.getByRole("button"));
  await act(async () => resolve({ terminal: { applicationTitleEnabled: false } }));
  expect(screen.getByRole("button")).toHaveTextContent("启用");
});
it("keeps titles disabled on read failure", async () => {
  mocks.getSettings.mockRejectedValue(new Error("unavailable"));
  render(<TerminalTitleProvider><Consumer/></TerminalTitleProvider>);
  await act(async () => undefined);
  expect(screen.getByRole("button")).toHaveTextContent("关闭");
});
