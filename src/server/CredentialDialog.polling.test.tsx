import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VaultStatus } from "../lib/contracts/credentials";
import { CredentialDialog } from "../components/dialogs/CredentialDialog";

const transport = vi.hoisted(() => ({ api: vi.fn(), request: vi.fn(), save: vi.fn() }));
vi.mock("./http", () => ({ api: transport.api, request: transport.request }));
vi.mock("./browserFiles", () => ({ saveBrowserResponse: transport.save, selectBrowserFile: vi.fn() }));
// Exercise the browser adapter under both the desktop and web Vitest configs.
vi.mock("@qterm/services/credentials", () => vi.importActual("./services/credentials"));
vi.mock("../lib/runtime/environment", () => ({ isServer: true, isDemo: false }));

let status: VaultStatus;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  status = { initialized: false, unlocked: false, legacy: false };
  transport.api.mockImplementation(async (path: string) => {
    if (path === "/vault") return { ...status };
    if (path === "/credentials") return [];
    if (path === "/vault/recovery") return { id: "test-recovery" };
    if (path === "/vault/initialize" || path === "/vault/unlock") {
      status = { initialized: true, unlocked: true, legacy: false };
      return { completed: true };
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  transport.request.mockResolvedValue(new Response("test-only-recovery-file"));
  transport.save.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

async function poll() {
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
}

it("preserves initialization and recovery confirmation across polls, then completes initialization", async () => {
  render(<CredentialDialog onClose={vi.fn()}/>);
  const dialog = await screen.findByRole("dialog", { name: "初始化密码保险库" });
  fireEvent.change(within(dialog).getByLabelText("主密码"), { target: { value: "test-master-password" } });
  fireEvent.change(within(dialog).getByLabelText("确认主密码"), { target: { value: "test-master-password" } });
  await poll();
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByLabelText("主密码")).toHaveValue("test-master-password");
  expect(within(dialog).getByLabelText("确认主密码")).toHaveValue("test-master-password");
  fireEvent.click(within(dialog).getByRole("button", { name: "初始化" }));
  const recovery = screen.getByRole("dialog", { name: "保存恢复密钥" });
  await poll();
  expect(recovery).toBeInTheDocument();
  const confirm = within(recovery).getByRole("button", { name: "确认保存并初始化" });
  expect(confirm).toBeDisabled();
  fireEvent.click(within(recovery).getByRole("button", { name: "下载恢复密钥" }));
  fireEvent.click(await within(recovery).findByRole("checkbox"));
  await poll();
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  expect(await screen.findByText("选择或创建凭证")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "初始化密码保险库" })).not.toBeInTheDocument();
  expect(transport.save).toHaveBeenCalledOnce();
  expect(transport.api).toHaveBeenCalledWith("/vault/initialize", "POST", {
    masterPassword: "test-master-password", recoveryId: "test-recovery", savedRecovery: true,
  });
});

it("preserves an unlock password across unchanged polls and unlocks successfully", async () => {
  status = { ...status, initialized: true };
  render(<CredentialDialog onClose={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button", { name: "解锁凭证库" }));
  const dialog = screen.getByRole("dialog", { name: "解锁密码保险库" });
  fireEvent.change(within(dialog).getByLabelText("主密码"), { target: { value: "test-master-password" } });
  await poll();
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByLabelText("主密码")).toHaveValue("test-master-password");
  fireEvent.click(within(dialog).getByRole("button", { name: "验证" }));
  expect(await screen.findByText("选择或创建凭证")).toBeInTheDocument();
  expect(transport.api).toHaveBeenCalledWith("/vault/unlock", "POST", { masterPassword: "test-master-password" });
});

it("still clears a sensitive draft when polling detects a real lock", async () => {
  status = { ...status, initialized: true, unlocked: true };
  render(<CredentialDialog onClose={vi.fn()}/>);
  await screen.findByText("选择或创建凭证");
  fireEvent.click(screen.getByRole("button", { name: "新建密码" }));
  const password = await screen.findByLabelText("密码");
  fireEvent.change(password, { target: { value: "test-secret-draft" } });
  status = { ...status, unlocked: false };
  await poll();
  expect(screen.getByRole("heading", { name: "凭证库已锁定" })).toBeInTheDocument();
  expect(password).not.toBeInTheDocument();
  status = { ...status, unlocked: true };
  await poll();
  fireEvent.click(screen.getByRole("button", { name: "新建密码" }));
  await waitFor(() => expect(screen.getByLabelText("密码")).toHaveValue(""));
});
