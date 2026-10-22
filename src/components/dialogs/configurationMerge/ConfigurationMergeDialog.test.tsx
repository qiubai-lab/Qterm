import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConfigurationMergeDialog } from "./ConfigurationMergeDialog";
import { cancelConfigurationMerge, commitConfigurationMerge, previewConfigurationMerge, selectMergeSource, unlockMergeSourceCredentials, CONFIGURATION_MERGED } from "../../../lib/tauri/configurationMerge";
import { getVaultStatus, initializeVault, unlockVault } from "../../../lib/tauri/credentials";
import { readCssBundle } from "../../../test/css";

vi.mock("../../../lib/tauri/configurationMerge", () => ({
  unlockMergeSourceCredentials: vi.fn(), selectMergeSource: vi.fn(), previewConfigurationMerge: vi.fn(), commitConfigurationMerge: vi.fn(), cancelConfigurationMerge: vi.fn(), CONFIGURATION_MERGED: "qterm:configuration-merged",
}));
vi.mock("../../../lib/tauri/credentials", () => ({ getVaultStatus: vi.fn(), initializeVault: vi.fn(), unlockVault: vi.fn() }));

beforeEach(() => {
  vi.mocked(cancelConfigurationMerge).mockResolvedValue();
  vi.mocked(unlockMergeSourceCredentials).mockResolvedValue();
  vi.mocked(selectMergeSource).mockResolvedValue({ source: "D:/source", connections: { count: 2, error: null }, network: { count: 1, error: null }, credentials: { count: 1, error: null } });
  vi.mocked(previewConfigurationMerge).mockResolvedValue({ token: "preview", changed: true, details: [{ category: "connections", name: "server", targetName: "server（导入 2）", outcome: "renamed", note: "需要重新绑定凭证" }] });
  vi.mocked(commitConfigurationMerge).mockResolvedValue();
  vi.mocked(getVaultStatus).mockResolvedValue({ initialized: true, unlocked: true, legacy: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function confirmStage() {
  const user = userEvent.setup();
  render(<ConfigurationMergeDialog target="C:/current" onClose={vi.fn()}/>);
  await user.click(screen.getByRole("button", { name: "选择来源配置目录" }));
  await user.click(screen.getByRole("button", { name: "合并配置" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认合并" })).toBeEnabled());
  return user;
}

it("keeps the directory input and button stable and waits for the explicit next step", async () => {
  const user = userEvent.setup();
  vi.mocked(selectMergeSource).mockResolvedValueOnce(null);
  render(<ConfigurationMergeDialog target="C:/current" onClose={vi.fn()}/>);
  expect(screen.getByRole("textbox", { name: "当前配置目录" })).toHaveValue("C:/current");
  expect(screen.getByRole("textbox", { name: "当前配置目录" })).toBeDisabled();
  expect(screen.getByText("完成合并")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "合并配置" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "选择来源配置目录" }));
  expect(screen.getByRole("button", { name: "选择来源配置目录" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "选择来源配置目录" }));
  expect(screen.getByLabelText("来源配置目录")).toHaveValue("D:/source");
  expect(screen.getByRole("button", { name: "选择来源配置目录" })).toBeInTheDocument();
  expect(screen.getByText("只读取来源目录；合并前可查看每项变更。").closest(".settings-card-heading")).toBeInTheDocument();
  expect(previewConfigurationMerge).not.toHaveBeenCalled();
  expect(screen.getByText("选择来源").closest("li")).toHaveAttribute("aria-current", "step");
  await user.click(screen.getByRole("button", { name: "合并配置" }));
  expect(screen.getByRole("checkbox", { name: "凭证" })).not.toBeChecked();
  expect(previewConfigurationMerge).toHaveBeenCalledWith({ connections: true, network: true, credentials: false }, "");
});

it("updates dependencies and previews automatically without a separate generate action", async () => {
  const user = await confirmStage();
  await user.click(screen.getByRole("checkbox", { name: "连接与分组" }));
  expect(screen.getByRole("checkbox", { name: "网络规则" })).toBeDisabled();
  expect(screen.getByRole("checkbox", { name: "网络规则" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "确认合并" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "生成变更详情" })).not.toBeInTheDocument();
});

it("verifies credentials in a child dialog then returns to confirmation without retaining a password", async () => {
  const user = await confirmStage();
  await user.click(screen.getByRole("checkbox", { name: "凭证" }));
  const dialog = await screen.findByRole("dialog", { name: "解锁合并凭证" });
  expect(screen.getByRole("checkbox", { name: "凭证" })).not.toBeChecked();
  expect(screen.getByRole("dialog", { name: "合并配置" }).parentElement).not.toHaveClass("dialog-scrim-blocking");
  expect(within(dialog).getByLabelText("来源配置主密码")).toHaveFocus();
  await user.type(within(dialog).getByLabelText("来源配置主密码"), "source-password");
  await user.click(within(dialog).getByRole("button", { name: "验证并解锁" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "解锁合并凭证" })).not.toBeInTheDocument());
  expect(screen.getByRole("checkbox", { name: "凭证" })).toBeChecked();
  expect(previewConfigurationMerge).toHaveBeenLastCalledWith({ connections: true, network: true, credentials: true }, "");
  expect(unlockMergeSourceCredentials).toHaveBeenCalledWith("source-password");
  expect(screen.queryByLabelText("来源配置主密码")).not.toBeInTheDocument();
  await user.click(screen.getByRole("checkbox", { name: "网络规则" }));
  expect(previewConfigurationMerge).toHaveBeenLastCalledWith({ connections: true, network: false, credentials: true }, "");
});

it("keeps failed verification in the child and cancelling leaves credentials unchecked", async () => {
  const user = await confirmStage();
  await user.click(screen.getByRole("checkbox", { name: "凭证" }));
  const dialog = await screen.findByRole("dialog", { name: "解锁合并凭证" });
  vi.mocked(unlockMergeSourceCredentials).mockRejectedValueOnce({ message: "来源主密码错误" });
  await user.type(within(dialog).getByLabelText("来源配置主密码"), "wrong");
  await user.click(within(dialog).getByRole("button", { name: "验证并解锁" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("来源主密码错误");
  expect(within(dialog).getByLabelText("来源配置主密码")).toHaveValue("");
  await user.click(within(dialog).getByRole("button", { name: "取消" }));
  expect(screen.getByRole("checkbox", { name: "凭证" })).not.toBeChecked();
});

it("initializes the current vault before asking for source credentials", async () => {
  const user = await confirmStage();
  vi.mocked(getVaultStatus).mockResolvedValue({ initialized: false, unlocked: false, legacy: false });
  await user.click(screen.getByRole("checkbox", { name: "凭证" }));
  const initialization = await screen.findByRole("dialog", { name: "初始化密码保险库" });
  expect(screen.queryByRole("dialog", { name: "解锁合并凭证" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("来源配置主密码")).not.toBeInTheDocument();
  await user.type(within(initialization).getByLabelText("主密码", { exact: true }), "current-password");
  await user.type(within(initialization).getByLabelText("确认主密码"), "current-password");
  await user.click(within(initialization).getByRole("button", { name: "初始化" }));
  vi.mocked(initializeVault).mockResolvedValueOnce({ completed: false });
  await user.click(screen.getByRole("button", { name: "保存到本地并初始化" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "保存到本地并初始化" })).toBeEnabled());
  expect(screen.queryByLabelText("来源配置主密码")).not.toBeInTheDocument();
  vi.mocked(initializeVault).mockResolvedValueOnce({ completed: true });
  await user.click(screen.getByRole("button", { name: "保存到本地并初始化" }));
  expect(await screen.findByLabelText("来源配置主密码")).toHaveFocus();
  expect(screen.queryByRole("dialog", { name: "初始化密码保险库" })).not.toBeInTheDocument();
  expect(screen.getByText("当前保险库 · 已就绪")).toBeInTheDocument();
});

it("commits only the preview, refreshes consumers and shows the completed step", async () => {
  const user = await confirmStage();
  const refreshed = vi.fn(); window.addEventListener(CONFIGURATION_MERGED, refreshed);
  expect(commitConfigurationMerge).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "确认合并" }));
  expect(await screen.findByRole("button", { name: "完成" })).toBeInTheDocument();
  expect(commitConfigurationMerge).toHaveBeenCalledExactlyOnceWith("preview");
  expect(refreshed).toHaveBeenCalledOnce();
  expect(screen.getByText("配置已合并")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看变更" })).not.toBeInTheDocument();
  expect(screen.queryByText(/项变更已检查/)).not.toBeInTheDocument();
  window.removeEventListener(CONFIGURATION_MERGED, refreshed);
});

it("requires a new preview after stale commit failure and cleans up on unmount", async () => {
  const user = await confirmStage();
  vi.mocked(commitConfigurationMerge).mockRejectedValueOnce({ message: "来源已变化，请重新预览" });
  await user.click(screen.getByRole("button", { name: "确认合并" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("来源已变化");
  expect(screen.getByRole("button", { name: "确认合并" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "重新检查" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认合并" })).toBeEnabled());
  cleanup(); expect(cancelConfigurationMerge).toHaveBeenCalled();
});

it("uses compact stable geometry and internal scrolling", () => {
  const css = readCssBundle("src/components/dialogs/configurationMerge/configurationMerge.css");
  expect(css).toMatch(/\.configuration-merge-details\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: hidden/);
  expect(css).toMatch(/\.configuration-merge-detail-list\s*\{[^}]*flex: 1;[^}]*min-height: 0/);
  expect(css).toMatch(/\.configuration-merge-detail-viewport\s*\{[^}]*overflow-y: auto/);
  expect(css).toMatch(/\[aria-busy="true"\]::before\s*\{[^}]*position: absolute;[^}]*animation: merge-vault-loading/);
  expect(css).toMatch(/\[aria-busy="true"\]::before\s*\{[^}]*inset: 0;[^}]*border-radius: inherit;[^}]*mask-composite: exclude/);
  expect(css).toMatch(/\.configuration-merge-complete-stage\s*\{[^}]*align-items: center;[^}]*justify-content: center/);
  expect(css).toMatch(/height: min\(440px, calc\(100dvh - 48px\)\)/);
  expect(css).toMatch(/\.dialog-frame\.configuration-merge-preview-dialog\s*\{\s*width: min\(800px, calc\(100vw - 48px\)\); height: min\(480px, calc\(100dvh - 48px\)\)/);
  expect(css).toMatch(/\.configuration-merge-detail\s*\{[^}]*height: 60px;[^}]*box-sizing: border-box/);
  expect(css).toMatch(/\.configuration-merge-dialog \.dialog-content\s*\{[^}]*flex: 1;[^}]*min-height: 0;[^}]*overflow: hidden/);
  expect(css).toMatch(/\.configuration-merge-body\s*\{[^}]*overflow-y: auto/);
  expect(css).toMatch(/\.configuration-merge-options input\s*\{[^}]*width: 14px;[^}]*height: 14px/);
  expect(css).toMatch(/\.configuration-merge-vault-content > form\s*\{[^}]*grid-template-rows: 48px minmax\(40px, 1fr\) 42px/);
  expect(css).toMatch(/\.configuration-merge-vault-content \.dialog-actions\s*\{[^}]*height: 42px;[^}]*flex-wrap: nowrap/);
  expect(css).toMatch(/\.configuration-merge-vault-content \.dialog-actions \.ui-button--primary\s*\{[^}]*width: 100px/);
  expect(css).toMatch(/\.configuration-merge-vault-dialog \.dialog-header\s*\{[^}]*height: 55px;[^}]*box-sizing: border-box/);
  expect(css).toMatch(/\.configuration-merge-vault-dialog \.dialog-header-actions\s*\{[^}]*width: 28px; height: 28px/);
});

it("keeps details in a child dialog and credential guidance in the footer", async () => {
  const user = await confirmStage();
  const parent = screen.getByRole("dialog", { name: "合并配置" });
  expect(screen.getByText("未合并凭证的新增连接需要重新绑定凭证。").closest("footer")).toBeInTheDocument();
  expect(within(parent).queryByRole("region", { name: "变更详情" })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "查看变更" }));
  const preview = screen.getByRole("dialog", { name: "变更预览" });
  expect(within(preview).getByRole("region", { name: "变更详情" })).toBeInTheDocument();
  expect(parent.parentElement).not.toHaveClass("dialog-scrim-blocking");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "变更预览" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "查看变更" })).toHaveFocus();
  expect(screen.getByRole("checkbox", { name: "连接与分组" })).toBeChecked();
});

it("returns to confirmation after unlock even when a network reference blocks preview", async () => {
  const user = await confirmStage();
  await user.click(screen.getByRole("checkbox", { name: "凭证" }));
  const dialog = await screen.findByRole("dialog", { name: "解锁合并凭证" });
  vi.mocked(previewConfigurationMerge).mockRejectedValueOnce({ message: "网络规则引用了来源中不存在的连接" });
  await user.type(within(dialog).getByLabelText("来源配置主密码"), "correct-password");
  await user.click(within(dialog).getByRole("button", { name: "验证并解锁" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("网络规则引用");
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "解锁合并凭证" })).not.toBeInTheDocument());
  expect(screen.getByRole("checkbox", { name: "凭证" })).toBeChecked();
  expect(screen.getByRole("button", { name: "确认合并" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "网络规则" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "确认合并" })).toBeEnabled());
  expect(unlockMergeSourceCredentials).toHaveBeenCalledTimes(1);
});

it("pins invalid rules in preview and allows valid additions to be merged", async () => {
  vi.mocked(previewConfigurationMerge).mockResolvedValue({ token: "mixed", changed: true, details: [
    { category: "connections", name: "server", targetName: "server", outcome: "added", note: "" },
    { category: "network", name: "orphan", targetName: "orphan", outcome: "invalid", note: "来源连接不存在（ID：missing），此规则不会导入" },
    { category: "groups", name: "team", targetName: "team", outcome: "skipped", note: "" },
  ] });
  const user = await confirmStage();
  expect(screen.getByRole("status")).toHaveTextContent("将跳过 1 条失效网络规则");
  await user.click(screen.getByRole("button", { name: "查看变更" }));
  const preview = screen.getByRole("dialog", { name: "变更预览" });
  expect(preview.querySelector(".configuration-merge-detail")).toHaveTextContent("orphan");
  expect(within(preview).getByLabelText("新增 1 · 复用 1 · 失效跳过 1")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "确认合并" }));
  expect(commitConfigurationMerge).toHaveBeenCalledWith("mixed");
  await screen.findByRole("button", { name: "完成" });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看变更" })).not.toBeInTheDocument();
});

it("allows inspecting invalid-only results without offering a commit", async () => {
  vi.mocked(previewConfigurationMerge).mockResolvedValue({ token: "", changed: false, details: [
    { category: "network", name: "orphan", targetName: "orphan", outcome: "invalid", note: "来源连接不存在" },
  ] });
  const user = userEvent.setup();
  render(<ConfigurationMergeDialog target="C:/current" onClose={vi.fn()}/>);
  await user.click(screen.getByRole("button", { name: "选择来源配置目录" }));
  await user.click(screen.getByRole("button", { name: "合并配置" }));
  await user.click(await screen.findByRole("button", { name: "查看变更" }));
  expect(screen.queryByText("没有可新增的有效配置；失效规则不会导入。")).not.toBeInTheDocument();
  const list = screen.getByLabelText("变更列表");
  expect(within(list).getByText("orphan")).toBeInTheDocument();
  expect(within(list).queryByText("变更明细")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认合并" })).toBeDisabled();
  expect(commitConfigurationMerge).not.toHaveBeenCalled();
});

it("advances from current to source vault in the same staged dialog", async () => {
  const user = await confirmStage();
  vi.mocked(getVaultStatus).mockResolvedValue({ initialized: true, unlocked: false, legacy: false });
  vi.mocked(unlockVault).mockResolvedValue(undefined);
  await user.click(screen.getByRole("checkbox", { name: "凭证" }));
  const dialog = await screen.findByRole("dialog", { name: "解锁合并凭证" });
  expect(within(dialog).getByText("当前保险库").closest("li")).toHaveAttribute("aria-current", "step");
  expect(within(dialog).getByLabelText("当前保险库配置目录")).toHaveValue("C:/current");
  const currentForm = within(dialog).getByLabelText("主密码").closest("form")!;
  expect(currentForm.children[0].tagName).toBe("LABEL");
  expect(currentForm.children[1]).toHaveClass("callout");
  vi.mocked(unlockVault).mockRejectedValueOnce({ message: "主密码错误，请重试" });
  await user.type(within(dialog).getByLabelText("主密码"), "wrong-password");
  await user.click(within(dialog).getByRole("button", { name: "解锁并继续" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("主密码错误");
  expect(within(dialog).getByRole("alert").closest("footer")).toBe(currentForm.lastElementChild);
  await user.type(within(dialog).getByLabelText("主密码"), "current-password");
  await user.click(within(dialog).getByRole("button", { name: "解锁并继续" }));
  await waitFor(() => expect(within(dialog).getByLabelText("来源配置主密码")).toHaveFocus());
  expect(screen.getByRole("dialog", { name: "解锁合并凭证" })).toBe(dialog);
  expect(within(dialog).getByText("当前保险库 · 已就绪")).toBeInTheDocument();
  expect(within(dialog).getByText("来源保险库").closest("li")).toHaveAttribute("aria-current", "step");
  expect(within(dialog).getByLabelText("来源保险库配置目录")).toHaveValue("D:/source");
  expect(within(dialog).getByLabelText("来源配置主密码")).toHaveValue("");
  const sourceForm = within(dialog).getByLabelText("来源配置主密码").closest("form")!;
  expect(sourceForm.children[0].tagName).toBe("LABEL");
  expect(sourceForm.children[1]).toHaveClass("configuration-merge-credential-intro");
  vi.mocked(unlockMergeSourceCredentials).mockRejectedValueOnce({ message: "来源密码错误，请重试" });
  await user.type(within(dialog).getByLabelText("来源配置主密码"), "wrong-password");
  await user.click(within(dialog).getByRole("button", { name: "验证并解锁" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("来源密码错误");
  expect(within(dialog).getByRole("alert").closest("footer")).toBe(sourceForm.lastElementChild);
});
