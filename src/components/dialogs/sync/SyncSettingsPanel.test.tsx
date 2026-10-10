import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncSettingsPanel } from "./SyncSettingsPanel";
import { configureSync, getSync, runSync, type SyncView } from "../../../lib/tauri/sync";

vi.mock("../../../lib/tauri/sync", () => ({ getSync: vi.fn(), configureSync: vi.fn(), runSync: vi.fn() }));
const initial: SyncView = { enabled: false, serverUrl: "", allowInsecureHttp: false, hasToken: false,
  status: { message: "", conflicts: [], conflictToken: null, lastSuccess: null } };
describe("optional synchronization settings", () => {
  afterEach(cleanup);
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(getSync).mockResolvedValue(initial); });
  it("defaults off and does not start synchronization on opening", async () => {
    render(<SyncSettingsPanel/>);
    await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "立即同步" })).toBeDisabled();
    expect(runSync).not.toHaveBeenCalled();
  });
  it("saves explicit opt-in and clears the entered secret", async () => {
    vi.mocked(configureSync).mockResolvedValue({ ...initial, enabled: true, serverUrl: "https://sync.test", hasToken: true });
    render(<SyncSettingsPanel/>); await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.change(screen.getByLabelText("服务器地址"), { target: { value: "https://sync.test" } });
    fireEvent.change(screen.getByLabelText("同步 Token"), { target: { value: "a-token-of-at-least-thirty-two-characters" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(configureSync).toHaveBeenCalledWith({ enabled: true, serverUrl: "https://sync.test", allowInsecureHttp: false, token: "a-token-of-at-least-thirty-two-characters" }));
    await waitFor(() => expect(screen.getByLabelText("同步 Token")).toHaveValue(""));
  });
  it("preserves the draft on persistence failure", async () => {
    vi.mocked(configureSync).mockRejectedValue("系统安全存储不可用");
    render(<SyncSettingsPanel/>); await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("服务器地址"), { target: { value: "https://sync.test" } });
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("系统安全存储不可用");
    expect(screen.getByLabelText("服务器地址")).toHaveValue("https://sync.test");
  });
});
