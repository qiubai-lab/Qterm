import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SshConfigImportDialog } from "./SshConfigImportDialog";

const mocks = vi.hoisted(() => ({
  getVaultStatus: vi.fn(),
  importSshConfig: vi.fn(),
  onImported: vi.fn(),
  previewSshConfigImport: vi.fn(),
}));

vi.mock("../../lib/tauri/credentials", () => ({ getVaultStatus: mocks.getVaultStatus }));
vi.mock("../../lib/tauri/profiles", () => ({
  importSshConfig: mocks.importSshConfig,
  previewSshConfigImport: mocks.previewSshConfigImport,
}));
vi.mock("./MasterPasswordDialog", () => ({ MasterPasswordDialog: () => <div>主密码弹窗</div> }));

const preview = {
  previewId: "preview-1",
  sourceName: "config",
  warnings: [],
  candidates: [{
    alias: "prod",
    name: "prod",
    host: "prod.example.com",
    port: 2202,
    username: "deploy",
    alreadyImported: false,
    importable: true,
    identities: [{ index: 0, fileName: "id_ed25519", status: "available" as const }],
    warnings: [],
  }],
};

beforeEach(() => {
  mocks.getVaultStatus.mockResolvedValue({ initialized: true, unlocked: true, legacy: false });
  mocks.previewSshConfigImport.mockResolvedValue(preview);
  mocks.importSshConfig.mockResolvedValue({ imported: 1, importedPrivateKeys: 0, reusedPrivateKeys: 0 });
  mocks.onImported.mockResolvedValue(undefined);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("SshConfigImportDialog", () => {
  it("requires an explicit explanation step before opening the native config picker", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SshConfigImportDialog onClose={onClose} onImported={mocks.onImported}/>);

    expect(screen.getByText(/~\/.ssh\/config/)).toBeInTheDocument();
    expect(mocks.previewSshConfigImport).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "选择配置" }));

    expect(await screen.findByText("deploy@prod.example.com:2202")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /连接信息/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /连接信息/ })).toHaveFocus();
    expect(screen.queryByLabelText("导入到分组")).not.toBeInTheDocument();
    expect(screen.queryByText("id_ed25519")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("/Users/example/.ssh/id_ed25519");
    await user.click(screen.getByRole("button", { name: "导入 1 项" }));

    expect(mocks.importSshConfig).toHaveBeenCalledWith("preview-1", [{ alias: "prod", identityFileIndex: null, passphrase: null }]);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("imports an explicitly selected IdentityFile with only its index and one-time passphrase", async () => {
    const user = userEvent.setup();
    mocks.importSshConfig.mockResolvedValue({ imported: 1, importedPrivateKeys: 1, reusedPrivateKeys: 0 });
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));
    await screen.findByText("prod");
    await user.click(screen.getByRole("tab", { name: /凭证/ }));
    const item = screen.getByText("id_ed25519").closest("article")!;
    await user.click(within(item).getByRole("checkbox", { name: /检测到 IdentityFile/ }));
    await user.type(screen.getByLabelText("prod 私钥口令"), "key-secret");
    await user.click(screen.getByRole("button", { name: "导入 1 项" }));

    expect(mocks.importSshConfig).toHaveBeenCalledWith("preview-1", [{ alias: "prod", identityFileIndex: 0, passphrase: "key-secret" }]);
  });

  it("disables malformed candidates and leaves no import action available", async () => {
    mocks.previewSshConfigImport.mockResolvedValue({
      ...preview,
      warnings: [],
      candidates: [{ ...preview.candidates[0], username: "", importable: false }],
    });
    const user = userEvent.setup();
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));
    expect(await screen.findByText("需修正")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导入 0 项" })).toBeDisabled();
  });

  it("marks a fully matching saved connection as imported and excludes it from selection", async () => {
    mocks.previewSshConfigImport.mockResolvedValue({
      ...preview,
      candidates: [{ ...preview.candidates[0], alreadyImported: true, importable: false }],
    });
    const user = userEvent.setup();
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));

    expect(await screen.findByText("已导入")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "导入 0 项" })).toBeDisabled();
  });

  it("selects and imports every alias for the same endpoint while showing allocated names", async () => {
    const sameEndpoint = {
      ...preview.candidates[0],
      alias: "PROD",
      name: "prod 2",
      warnings: ["连接名称“prod”已存在，导入后将保存为“prod 2”"],
    };
    mocks.previewSshConfigImport.mockResolvedValue({
      ...preview,
      candidates: [
        preview.candidates[0],
        sameEndpoint,
      ],
    });
    mocks.importSshConfig.mockResolvedValue({ imported: 2, importedPrivateKeys: 0, reusedPrivateKeys: 0 });
    const user = userEvent.setup();
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));
    expect(await screen.findByRole("button", { name: "导入 2 项" })).toBeEnabled();
    expect(screen.getByText("名称已区分")).toBeInTheDocument();
    expect(screen.getByText("prod 2", { selector: ".ssh-config-import-choice strong" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").filter((checkbox) => (checkbox as HTMLInputElement).checked)).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "导入 2 项" }));

    expect(mocks.importSshConfig).toHaveBeenCalledWith("preview-1", [
      { alias: "prod", identityFileIndex: null, passphrase: null },
      { alias: "PROD", identityFileIndex: null, passphrase: null },
    ]);
  });

  it("keeps credential authorization in a separate semantic tab", async () => {
    const user = userEvent.setup();
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));
    await screen.findByText("deploy@prod.example.com:2202");
    await user.click(screen.getByRole("tab", { name: /凭证/ }));

    expect(screen.getByRole("tab", { name: /凭证/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: /凭证/ })).toContainElement(screen.getByText("id_ed25519"));
    expect(screen.queryByLabelText("导入到分组")).not.toBeInTheDocument();
  });

  it("keeps the dialog usable when native file selection is cancelled", async () => {
    const user = userEvent.setup();
    mocks.previewSshConfigImport.mockResolvedValue(null);
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);

    await user.click(screen.getByRole("button", { name: "选择配置" }));
    await waitFor(() => expect(mocks.previewSshConfigImport).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "选择配置" }));

    await waitFor(() => expect(mocks.previewSshConfigImport).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/~\/.ssh\/config/)).toBeInTheDocument();
  });

  it("places the selected file and compact reselect action in the manager header before close", async () => {
    const user = userEvent.setup();
    render(<SshConfigImportDialog onClose={vi.fn()} onImported={mocks.onImported}/>);
    await user.click(screen.getByRole("button", { name: "选择配置" }));

    const header = (await screen.findByRole("button", { name: "重新选择" })).closest<HTMLElement>(".dialog-header")!;
    const actions = header.querySelector(".dialog-header-actions")!;
    expect(Array.from(actions.children).map((element) => element.textContent || element.getAttribute("aria-label"))).toEqual(["config", "重新选择", "关闭"]);
    expect(within(header).getByLabelText("当前配置文件：config")).toHaveAttribute("title", "config");
    expect(document.querySelector(".ssh-config-import-source")).not.toBeInTheDocument();
  });
});
