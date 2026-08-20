import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../../lib/tauri/profiles";
import { ConnectionDialog } from "./ConnectionDialog";

const mocks = vi.hoisted(() => ({
  clearVault: vi.fn(),
  createProfile: vi.fn(),
  createProfileGroup: vi.fn(),
  deletePassword: vi.fn(),
  deleteProfile: vi.fn(),
  deleteProfileGroup: vi.fn(),
  getVaultStatus: vi.fn(),
  hasSavedPassword: vi.fn(),
  listProfileGroups: vi.fn(),
  loadPassword: vi.fn(),
  listCredentials: vi.fn(),
  lockVault: vi.fn(),
  onVaultStatusChanged: vi.fn(),
  revealCredentialPassword: vi.fn(),
  refreshProfiles: vi.fn(),
  savePassword: vi.fn(),
  selectBlockTarget: vi.fn(),
  updateProfile: vi.fn(),
  updateProfileGroup: vi.fn(),
}));

const group = { id: "group-1", name: "Production" };
const profile = {
  id: "profile-1",
  name: "K8S服务器",
  host: "10.100.5.28",
  port: 22,
  username: "root",
  authPreference: "password" as const,
  credentialId: "password-1",
  groupId: "group-1",
};
const profiles = [profile];
let workspaceProfiles: ConnectionProfile[] = profiles;
const elementFromPoint = vi.fn<(x: number, y: number) => Element | null>();

vi.mock("../../lib/tauri/credentials", () => ({
  clearVault: mocks.clearVault,
  deletePassword: mocks.deletePassword,
  getVaultStatus: mocks.getVaultStatus,
  hasSavedPassword: mocks.hasSavedPassword,
  loadPassword: mocks.loadPassword,
  listCredentials: mocks.listCredentials,
  lockVault: mocks.lockVault,
  onVaultStatusChanged: mocks.onVaultStatusChanged,
  revealCredentialPassword: mocks.revealCredentialPassword,
  savePassword: mocks.savePassword,
}));
vi.mock("../../lib/tauri/profiles", () => ({
  createProfile: mocks.createProfile,
  createProfileGroup: mocks.createProfileGroup,
  deleteProfile: mocks.deleteProfile,
  deleteProfileGroup: mocks.deleteProfileGroup,
  listProfileGroups: mocks.listProfileGroups,
  updateProfile: mocks.updateProfile,
  updateProfileGroup: mocks.updateProfileGroup,
}));
vi.mock("../../workspace/WorkspaceProvider", () => ({
  useWorkspace: () => ({
    profiles: workspaceProfiles,
    refreshProfiles: mocks.refreshProfiles,
    activeWorkspace: {
      id: "workspace-1",
      name: "Workspace 1",
      activeBlockId: "block-1",
      layout: { type: "terminal", blockId: "block-1", profileId: "profile-1" },
    },
    activeBlockId: "block-1",
    selectBlockTarget: mocks.selectBlockTarget,
  }),
}));
vi.mock("./MasterPasswordDialog", () => ({ MasterPasswordDialog: ({ mode, onSuccess }: { mode: string; onSuccess: () => void }) => <div data-testid="master-password-mode">{mode}<button onClick={onSuccess}>完成主密码操作</button></div> }));

beforeEach(() => {
  workspaceProfiles = profiles;
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: elementFromPoint });
  mocks.clearVault.mockResolvedValue(undefined);
  mocks.createProfile.mockResolvedValue({ ...profile, id: "profile-new" });
  mocks.createProfileGroup.mockResolvedValue(group);
  mocks.deleteProfile.mockResolvedValue(undefined);
  mocks.deleteProfileGroup.mockResolvedValue(undefined);
  mocks.getVaultStatus.mockResolvedValue({ initialized: false, unlocked: false });
  mocks.hasSavedPassword.mockResolvedValue(false);
  mocks.listProfileGroups.mockResolvedValue([group]);
  mocks.loadPassword.mockResolvedValue("stored-secret");
  mocks.listCredentials.mockResolvedValue([{ id: "password-1", name: "生产密码", kind: "password", detail: null }]);
  mocks.lockVault.mockResolvedValue(undefined);
  mocks.onVaultStatusChanged.mockResolvedValue(() => undefined);
  mocks.revealCredentialPassword.mockResolvedValue("stored-secret");
  mocks.refreshProfiles.mockResolvedValue(undefined);
  mocks.savePassword.mockResolvedValue(undefined);
  mocks.selectBlockTarget.mockResolvedValue(undefined);
  mocks.updateProfile.mockResolvedValue(profile);
  mocks.updateProfileGroup.mockResolvedValue(group);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("ConnectionDialog", () => {
  it("keeps the endpoint contiguous and appends each profile authentication method", async () => {
    workspaceProfiles = [
      profile,
      { ...profile, id: "profile-key", name: "Key server", host: "key.example", port: 2202, username: "deploy", authPreference: "privateKey" },
      { ...profile, id: "profile-agent", name: "Agent server", host: "agent.example", username: "ops", authPreference: "sshAgent" },
    ];
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const productionToggle = (await screen.findByText("Production", { selector: ".connection-group-toggle strong" })).closest("button")!;
    fireEvent.click(productionToggle);

    const passwordItem = screen.getByRole("button", { name: /K8S服务器/ });
    expect(passwordItem.querySelector(".connection-item-address")).toHaveTextContent("root@10.100.5.28:22");
    expect(passwordItem.querySelector(".connection-item-auth")).toHaveTextContent("密码");
    const keyItem = screen.getByRole("button", { name: /Key server/ });
    expect(keyItem.querySelector(".connection-item-address")).toHaveTextContent("deploy@key.example:2202");
    expect(keyItem.querySelector(".connection-item-auth")).toHaveTextContent("私钥");
    expect(screen.getByRole("button", { name: /Agent server/ }).querySelector(".connection-item-auth")).toHaveTextContent("代理");
  });

  it("starts every connection section collapsed and keeps its drop target when expanded", async () => {
    const user = userEvent.setup();
    workspaceProfiles = [{ ...profile, groupId: null }];
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const ungroupedToggle = await screen.findByRole("button", { name: /未分组/ });
    const productionToggle = screen.getByRole("button", { name: /Production/ });
    const section = ungroupedToggle.closest<HTMLElement>(".connection-group-section")!;
    expect(ungroupedToggle).toHaveAttribute("aria-expanded", "false");
    expect(productionToggle).toHaveAttribute("aria-expanded", "false");
    expect(section).toHaveAttribute("data-profile-drop-group", "");
    expect(within(section).queryByRole("button", { name: /K8S服务器/ })).not.toBeInTheDocument();
    await user.click(ungroupedToggle);
    expect(ungroupedToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(section).getByRole("button", { name: /K8S服务器/ })).toBeInTheDocument();
  });

  it("splits connection and authentication fields into tabs and removes immediate session actions", async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);

    expect(await screen.findByRole("tab", { name: "连接信息" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("名称")).toHaveValue("K8S服务器");
    expect(screen.getByLabelText("主机")).toHaveValue("10.100.5.28");
    expect(screen.queryByRole("combobox", { name: "认证方式" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "连接当前终端" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "断开" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "认证方式" }));
    expect(screen.getByRole("tab", { name: "认证方式" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("combobox", { name: "认证方式" })).toHaveValue("password");
    expect(screen.queryByLabelText("主机")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "连接信息" }));
    await user.click(screen.getByRole("tab", { name: "认证方式" }));
    expect(screen.getByRole("tab", { name: "认证方式" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "认证方式" })).toBeInTheDocument();
  });

  it("selects a reusable credential reference without exposing password viewing", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
    render(<ConnectionDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("tab", { name: "认证方式" }));
    expect(await screen.findByRole("combobox", { name: "引用凭证" })).toHaveValue("password-1");
    expect(screen.getByRole("option", { name: "生产密码" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "显示密码" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("已保存密码")).not.toBeInTheDocument();
    expect(mocks.revealCredentialPassword).not.toHaveBeenCalled();
  });

  it("shows the linked credential name while locked and requires unlock before changing it", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus.mockResolvedValueOnce({ initialized: true, unlocked: false }).mockResolvedValueOnce({ initialized: true, unlocked: true });
    render(<ConnectionDialog onClose={vi.fn()}/>);

    await user.click(await screen.findByRole("tab", { name: "认证方式" }));
    const lockedSelector = await screen.findByRole("button", { name: "解锁后选择凭证，当前：生产密码" });
    expect(lockedSelector).toHaveTextContent("生产密码");
    expect(mocks.listCredentials).toHaveBeenCalledOnce();

    await user.click(lockedSelector);
    expect(screen.getByTestId("master-password-mode")).toHaveTextContent("unlock");
    await user.click(screen.getByRole("button", { name: "完成主密码操作" }));

    expect(await screen.findByRole("combobox", { name: "引用凭证" })).toHaveValue("password-1");
    expect(mocks.listCredentials).toHaveBeenCalledTimes(2);
  });

  it("keeps the active tab and presents save progress and success on the button", async () => {
    let resolveUpdate!: (value: ConnectionProfile) => void;
    mocks.updateProfile.mockReturnValue(new Promise((resolve) => { resolveUpdate = resolve; }));
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);
    const authTab = await screen.findByRole("tab", { name: "认证方式" });
    await user.click(authTab);

    await user.click(screen.getByRole("button", { name: "保存配置" }));
    expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
    await act(async () => { resolveUpdate(profile); });

    expect(await screen.findByRole("button", { name: "保存成功" })).toHaveAttribute("data-state", "success");
    expect(authTab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("连接配置已保存")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "保存配置" })).toHaveAttribute("data-state", "idle"), { timeout: 2000 });
  });

  it("returns the save button to idle and keeps failures in the editor", async () => {
    const user = userEvent.setup();
    mocks.updateProfile.mockRejectedValue(new Error("保存失败，请重试"));
    render(<ConnectionDialog onClose={vi.fn()}/>);
    await screen.findByDisplayValue("K8S服务器");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请重试");
    expect(screen.getByRole("button", { name: "保存配置" })).not.toBeDisabled();
  });

  it("opens credential management beside the selector and preserves the connection draft", async () => {
    const user = userEvent.setup();
    mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true });
    render(<ConnectionDialog onClose={vi.fn()}/>);
    const name = await screen.findByLabelText("名称");
    await user.clear(name);
    await user.type(name, "未保存名称");
    await user.click(screen.getByRole("tab", { name: "认证方式" }));
    await user.click(screen.getByRole("button", { name: "管理凭证" }));

    const manager = await screen.findByRole("dialog", { name: "凭证管理" });
    expect(manager).toBeInTheDocument();
    await user.click(within(manager).getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "凭证管理" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "连接信息" }));
    expect(screen.getByLabelText("名称")).toHaveValue("未保存名称");
  });

  it("saves manual authentication without a credential reference", async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);
    await user.click(await screen.findByRole("tab", { name: "认证方式" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "认证方式" }), "manual");
    expect(screen.getByText("每次连接时手动选择")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith("profile-1", expect.objectContaining({
      authPreference: "manual",
      credentialId: null,
    })));
  });

  it("uses the trimmed host as the name when a new profile has no name", async () => {
    const user = userEvent.setup();
    mocks.createProfile.mockResolvedValue({ ...profile, id: "profile-new", name: "server.example", host: "server.example" });
    render(<ConnectionDialog onClose={vi.fn()}/>);

    await user.click(screen.getByRole("button", { name: "＋ 新建连接" }));
    await user.type(screen.getByLabelText("名称"), "   ");
    await user.type(screen.getByLabelText("主机"), "  server.example  ");
    await user.type(screen.getByLabelText("用户名"), "root");
    await user.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => expect(mocks.createProfile).toHaveBeenCalledWith(expect.objectContaining({
      name: "server.example",
      host: "  server.example  ",
    })));
  });

  it("requires confirmation before deleting a saved profile", async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);
    await screen.findByDisplayValue("K8S服务器");

    await user.click(screen.getByRole("button", { name: "删除" }));
    const confirmation = screen.getByRole("dialog", { name: "删除连接？" });
    expect(within(confirmation).getByText(/K8S服务器/)).toBeInTheDocument();
    expect(mocks.deleteProfile).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "取消" }));
    expect(mocks.deleteProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "删除" }));
    await user.click(within(screen.getByRole("dialog", { name: "删除连接？" })).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(mocks.deleteProfile).toHaveBeenCalledWith("profile-1"));
  });

  it("creates a group and starts a connection from the group context menu", async () => {
    const user = userEvent.setup();
    mocks.createProfileGroup.mockResolvedValue({ id: "group-2", name: "Staging" });
    render(<ConnectionDialog onClose={vi.fn()}/>);

    await user.click(await screen.findByRole("button", { name: "＋ 新建分组" }));
    const createDialog = screen.getByRole("dialog", { name: "新建分组" });
    await user.type(within(createDialog).getByLabelText("分组名称"), "Staging");
    await user.click(within(createDialog).getByRole("button", { name: "创建分组" }));
    await waitFor(() => expect(mocks.createProfileGroup).toHaveBeenCalledWith("Staging"));
    const stagingToggle = (await screen.findByText("Staging", { selector: ".connection-group-toggle strong" })).closest("button")!;
    expect(stagingToggle).toHaveAttribute("aria-expanded", "false");

    const productionHeading = screen.getByText("Production", { selector: ".connection-group-toggle strong" });
    fireEvent.contextMenu(productionHeading.closest("button")!);
    const groupMenu = screen.getByRole("menu", { name: "Production 分组菜单" });
    await user.click(within(groupMenu).getByRole("menuitem", { name: "在此分组新建连接" }));
    await user.type(screen.getByLabelText("主机"), "prod.example");
    await user.type(screen.getByLabelText("用户名"), "deploy");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(mocks.createProfile).toHaveBeenCalledWith(expect.objectContaining({ groupId: "group-1" })));
  });

  it("moves a profile between groups through the connection editor", async () => {
    const user = userEvent.setup();
    mocks.listProfileGroups.mockResolvedValue([group, { id: "group-2", name: "Staging" }]);
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const groupPicker = await screen.findByRole("combobox", { name: "分组" });
    await user.selectOptions(groupPicker, "group-2");
    await user.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith("profile-1", expect.objectContaining({ groupId: "group-2" })));
  });

  it("renames groups from a context menu and confirms deletion before moving connections to ungrouped", async () => {
    const user = userEvent.setup();
    mocks.updateProfileGroup.mockResolvedValue({ id: "group-1", name: "Core" });
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const productionHeading = await screen.findByText("Production", { selector: ".connection-group-toggle strong" });
    fireEvent.contextMenu(productionHeading.closest("button")!);
    await user.click(within(screen.getByRole("menu", { name: "Production 分组菜单" })).getByRole("menuitem", { name: "重命名分组" }));
    const manager = screen.getByRole("dialog", { name: "管理分组" });
    await user.clear(within(manager).getByLabelText("分组名称"));
    await user.type(within(manager).getByLabelText("分组名称"), "Core");
    await user.click(within(manager).getByRole("button", { name: "保存分组" }));
    await waitFor(() => expect(mocks.updateProfileGroup).toHaveBeenCalledWith("group-1", "Core"));

    const coreHeading = await screen.findByText("Core", { selector: ".connection-group-toggle strong" });
    fireEvent.contextMenu(coreHeading.closest("button")!);
    await user.click(within(screen.getByRole("menu", { name: "Core 分组菜单" })).getByRole("menuitem", { name: "删除分组" }));
    const confirmation = screen.getByRole("dialog", { name: "删除分组？" });
    expect(within(confirmation).getByText(/移到“未分组”/)).toBeInTheDocument();
    expect(mocks.deleteProfileGroup).not.toHaveBeenCalled();
    await user.click(within(confirmation).getByRole("button", { name: "确认删除" }));
    await waitFor(() => expect(mocks.deleteProfileGroup).toHaveBeenCalledWith("group-1"));
  });

  it("moves a connection with a captured pointer gesture and ignores its current group", async () => {
    mocks.listProfileGroups.mockResolvedValue([group, { id: "group-2", name: "Staging" }]);
    mocks.updateProfile.mockResolvedValue({ ...profile, groupId: "group-2" });
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const productionToggle = (await screen.findByText("Production", { selector: ".connection-group-toggle strong" })).closest("button")!;
    fireEvent.click(productionToggle);
    const item = screen.getByRole("button", { name: /K8S服务器/ });
    const productionTarget = productionToggle.closest("header")!;
    elementFromPoint.mockReturnValue(productionTarget);
    fireEvent.pointerDown(item, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { pointerId: 1, clientX: 22, clientY: 22 });
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 22, clientY: 22 });
    expect(mocks.updateProfile).not.toHaveBeenCalled();

    const stagingTarget = screen.getByText("Staging", { selector: ".connection-group-toggle strong" }).closest("header")!;
    const currentItem = screen.getByRole("button", { name: /K8S服务器/ });
    elementFromPoint.mockReturnValue(stagingTarget);
    fireEvent.pointerDown(currentItem, { pointerId: 2, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(currentItem, { pointerId: 2, clientX: 30, clientY: 34 });
    expect(stagingTarget).toHaveClass("drop-target");
    expect(document.querySelector(".connection-drag-preview")).toBeInTheDocument();
    fireEvent.pointerUp(currentItem, { pointerId: 2, clientX: 30, clientY: 34 });
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith("profile-1", expect.objectContaining({ groupId: "group-2" })));
    expect(mocks.refreshProfiles).toHaveBeenCalled();
    expect(stagingTarget).not.toHaveClass("drop-target");
    expect(stagingTarget.querySelector("button")).toHaveAttribute("aria-expanded", "false");

    mocks.updateProfile.mockClear();
    const ungroupedTarget = screen.getByRole("button", { name: /未分组/ }).closest("header")!;
    elementFromPoint.mockReturnValue(ungroupedTarget);
    fireEvent.pointerDown(currentItem, { pointerId: 6, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(currentItem, { pointerId: 6, clientX: 30, clientY: 34 });
    expect(ungroupedTarget).toHaveClass("drop-target");
    fireEvent.pointerUp(currentItem, { pointerId: 6, clientX: 30, clientY: 34 });
    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalledWith("profile-1", expect.objectContaining({ groupId: null })));
  });

  it("cancels a pointer drag without moving and keeps sub-threshold clicks available", async () => {
    mocks.listProfileGroups.mockResolvedValue([group, { id: "group-2", name: "Staging" }]);
    render(<ConnectionDialog onClose={vi.fn()}/>);
    await screen.findByText("Staging", { selector: ".connection-group-toggle strong" });
    fireEvent.click(screen.getByText("Production", { selector: ".connection-group-toggle strong" }).closest("button")!);
    const item = screen.getByRole("button", { name: /K8S服务器/ });
    const stagingTarget = screen.getByText("Staging", { selector: ".connection-group-toggle strong" }).closest("header")!;
    elementFromPoint.mockReturnValue(stagingTarget);

    fireEvent.pointerDown(item, { pointerId: 3, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { pointerId: 3, clientX: 14, clientY: 14 });
    expect(document.querySelector(".connection-drag-preview")).not.toBeInTheDocument();
    fireEvent.pointerUp(item, { pointerId: 3, clientX: 14, clientY: 14 });
    expect(mocks.updateProfile).not.toHaveBeenCalled();

    fireEvent.pointerDown(item, { pointerId: 4, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { pointerId: 4, clientX: 30, clientY: 30 });
    expect(stagingTarget).toHaveClass("drop-target");
    fireEvent.pointerCancel(item, { pointerId: 4 });
    expect(stagingTarget).not.toHaveClass("drop-target");
    expect(document.querySelector(".connection-drag-preview")).not.toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();

    elementFromPoint.mockReturnValue(null);
    fireEvent.pointerDown(item, { pointerId: 5, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { pointerId: 5, clientX: 30, clientY: 30 });
    expect(document.querySelector(".connection-drag-preview")).toBeInTheDocument();
    fireEvent.pointerUp(item, { pointerId: 5, clientX: 30, clientY: 30 });
    expect(document.querySelector(".connection-drag-preview")).not.toBeInTheDocument();
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("keeps profile context menus focused on editing and deletion", async () => {
    const user = userEvent.setup();
    render(<ConnectionDialog onClose={vi.fn()}/>);

    await screen.findByText("Production", { selector: ".connection-group-toggle strong" });
    fireEvent.click(screen.getByText("Production", { selector: ".connection-group-toggle strong" }).closest("button")!);
    const item = screen.getByRole("button", { name: /K8S服务器/ });
    fireEvent.contextMenu(item);
    const menu = screen.getByRole("menu", { name: "K8S服务器 连接菜单" });
    expect(within(menu).getByRole("menuitem", { name: "编辑连接" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /移至/ })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "删除连接" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "编辑连接" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /K8S服务器/ }), { key: "ContextMenu" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "K8S服务器 连接菜单" })).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: /K8S服务器/ }), { key: "ContextMenu" });
    await user.click(within(screen.getByRole("menu", { name: "K8S服务器 连接菜单" })).getByRole("menuitem", { name: "删除连接" }));
    expect(screen.getByRole("dialog", { name: "删除连接？" })).toBeInTheDocument();
  });

  it("keeps group headers compact and opens their menu from the keyboard", async () => {
    render(<ConnectionDialog onClose={vi.fn()}/>);

    const heading = (await screen.findByText("Production", { selector: ".connection-group-toggle strong" })).closest("button")!;
    expect(screen.queryByRole("button", { name: "在 Production 中新建连接" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "管理分组 Production" })).not.toBeInTheDocument();
    fireEvent.keyDown(heading, { key: "ContextMenu" });
    expect(screen.getByRole("menu", { name: "Production 分组菜单" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu", { name: "Production 分组菜单" })).not.toBeInTheDocument();
  });
});
