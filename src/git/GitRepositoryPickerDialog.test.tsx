import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitRepositoryPickerDialog } from "./GitRepositoryPickerDialog";

const api = vi.hoisted(() => ({ list: vi.fn(), listLocal: vi.fn(), listRoots: vi.fn() }));

vi.mock("../lib/tauri/git", () => ({
  listRemoteGitDirectory: api.list,
  gitError: (error: unknown) => error as { code: string; message: string },
}));

vi.mock("../lib/tauri/files", () => ({
  listLocalDirectory: api.listLocal,
  listLocalRoots: api.listRoots,
}));

function listing(path: string, names: string[]) {
  return {
    path,
    entries: names.map((name) => ({
      name,
      path: `${path.replace(/\/$/, "")}/${name}`,
      isSymlink: false,
      modifiedAt: null,
      permissionMode: null,
    })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

describe("GitRepositoryPickerDialog", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockImplementation(async (_sessionId: string, _profileId: string, path: string) => {
      if (path === "/srv/project") return listing(path, ["alpha", "beta"]);
      if (path === "/srv/project/alpha") return listing(path, ["nested"]);
      if (path === "/srv") return listing(path, ["project"]);
      return listing(path, []);
    });
    api.listLocal.mockImplementation(async (path: string) => ({
      path,
      entries: [
        { name: "directory", path: `${path}/directory`, isDirectory: true, isSymlink: false, size: 0, modifiedAt: null, permissionMode: null },
        { name: "file.txt", path: `${path}/file.txt`, isDirectory: false, isSymlink: false, size: 10, modifiedAt: null, permissionMode: null },
      ],
    }));
    api.listRoots.mockResolvedValue([{ name: "C:", path: "C:\\" }, { name: "D:", path: "D:\\" }]);
  });

  it("reuses the picker shell for local directories, filters files, and opens local roots", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog mode="local" initialPath={"C:\\work"} onClose={vi.fn()} onSelect={onSelect} onSelectSystemDirectory={vi.fn().mockResolvedValue(null)}/>);

    expect(await screen.findByRole("dialog", { name: "选择本机仓库目录" })).toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: /^目录 directory/ })).toBeInTheDocument();
    expect(api.listLocal).toHaveBeenCalledWith("C:\\work");
    expect(screen.queryByText("file.txt")).not.toBeInTheDocument();
    expect(screen.getByText("类型")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回上级目录" }));
    expect(api.listLocal).toHaveBeenLastCalledWith("C:\\");
    await user.click(screen.getByRole("button", { name: "返回上级目录" }));
    expect(await screen.findByRole("list", { name: "本机根目录" })).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^目录 D:/ })).toBeInTheDocument();
  });

  it("keeps the local picker open when system selection is cancelled and submits a selected system path", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onSelectSystemDirectory = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("D:\\project");
    render(<GitRepositoryPickerDialog mode="local" initialPath={"C:\\work"} onClose={vi.fn()} onSelect={onSelect} onSelectSystemDirectory={onSelectSystemDirectory}/>);
    await screen.findByRole("list", { name: "本机目录 C:\\work" });

    await user.click(screen.getByRole("button", { name: "使用系统选择器" }));
    expect(screen.getByRole("dialog", { name: "选择本机仓库目录" })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "使用系统选择器" }));
    expect(onSelect).toHaveBeenCalledWith("D:\\project");
  });

  it("selects on click, opens on double click, and navigates with the file-browser forward stack", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={onSelect}/>);

    expect(await screen.findByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith("git-session", "profile-1", "/srv/project");

    const alpha = screen.getByRole("listitem", { name: /^目录 alpha/ });
    expect(alpha.querySelector('[data-icon="forward"]')).not.toBeInTheDocument();
    await user.click(alpha);
    expect(alpha).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    expect(screen.getByTitle("/srv/project/alpha")).toHaveTextContent("/srv/project/alpha");
    expect(onSelect).not.toHaveBeenCalled();

    await user.dblClick(alpha);
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project/alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/srv/project/alpha" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "返回上级目录" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前进到下一目录" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project/alpha" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新目录" }));

    expect(api.list).toHaveBeenLastCalledWith("git-session", "profile-1", "/srv/project/alpha");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("opens a selected directory with Enter and confirms a selected directory without opening it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={onSelect}/>);
    await screen.findByRole("list", { name: "远程目录 /srv/project" });

    const beta = screen.getByRole("listitem", { name: /^目录 beta/ });
    await user.click(beta);
    await user.click(screen.getByRole("button", { name: "选择此路径" }));
    expect(onSelect).toHaveBeenCalledWith("/srv/project/beta");

    const alpha = screen.getByRole("listitem", { name: /^目录 alpha/ });
    alpha.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project/alpha" })).toBeInTheDocument();
  });

  it("edits the path on demand and restores the current path with Escape", async () => {
    const user = userEvent.setup();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={vi.fn()}/>);
    await screen.findByRole("list", { name: "远程目录 /srv/project" });

    await user.click(screen.getByRole("button", { name: "/srv/project" }));
    const input = screen.getByRole("textbox", { name: "远程仓库路径" });
    await user.clear(input);
    await user.type(input, "/draft/path");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox", { name: "远程仓库路径" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "/srv/project" })).toBeInTheDocument();
    expect(screen.getByTitle("/srv/project")).toHaveTextContent("/srv/project");
  });

  it("keeps manual path confirmation available when SFTP browsing fails", async () => {
    const user = userEvent.setup();
    api.list.mockRejectedValue({ code: "directoryUnavailable", message: "服务器未开放 SFTP" });
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={onSelect}/>);

    expect(await screen.findByRole("alert")).toHaveTextContent("服务器未开放 SFTP");
    expect(screen.getByText("仍可直接输入远程路径并选择")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "/srv/project" }));
    const path = screen.getByRole("textbox", { name: "远程仓库路径" });
    await user.clear(path);
    await user.type(path, "/opt/repos/manual");
    await user.click(screen.getByRole("button", { name: "选择此路径" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("/opt/repos/manual");
  });

  it("shows file-browser permission and modified-time metadata with stable fallbacks", async () => {
    const modifiedAt = 1_725_187_200;
    api.list.mockResolvedValue({
      path: "/srv/project",
      entries: [
        { name: "metadata", path: "/srv/project/metadata", isSymlink: false, modifiedAt, permissionMode: 0o754 },
        { name: "unknown", path: "/srv/project/unknown", isSymlink: false, modifiedAt: null, permissionMode: null },
      ],
    });
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={vi.fn()}/>);

    expect(await screen.findByText("rwxr-xr--")).toBeInTheDocument();
    expect(screen.getByText(new Date(modifiedAt * 1000).toLocaleString())).toBeInTheDocument();
    const unknown = screen.getByRole("listitem", { name: /^目录 unknown/ });
    expect(within(unknown).getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("权限")).toBeInTheDocument();
    expect(screen.getByText("修改时间")).toBeInTheDocument();
  });

  it("discards stale directory responses and keeps the latest navigation result", async () => {
    const user = userEvent.setup();
    const slow = deferred<ReturnType<typeof listing>>();
    const fast = deferred<ReturnType<typeof listing>>();
    api.list.mockImplementation(async (_sessionId: string, _profileId: string, path: string) => {
      if (path === "/slow") return slow.promise;
      if (path === "/fast") return fast.promise;
      return listing(path, []);
    });
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={vi.fn()}/>);
    await screen.findByRole("list", { name: "远程目录 /srv/project" });
    await user.click(screen.getByRole("button", { name: "/srv/project" }));
    const path = screen.getByRole("textbox", { name: "远程仓库路径" });

    await user.clear(path);
    await user.type(path, "/slow");
    await user.keyboard("{Enter}");
    await user.clear(path);
    await user.type(path, "/fast");
    await user.keyboard("{Enter}");

    fast.resolve(listing("/fast", ["latest"]));
    expect(await screen.findByRole("list", { name: "远程目录 /fast" })).toBeInTheDocument();
    slow.resolve(listing("/slow", ["stale"]));
    await waitFor(() => expect(screen.getByRole("list", { name: "远程目录 /fast" })).toBeInTheDocument());
    expect(screen.queryByRole("listitem", { name: /^目录 stale/ })).not.toBeInTheDocument();
  });

  it("uses bounded rendering for large directory listings", async () => {
    api.list.mockResolvedValue(listing("/srv/project", Array.from({ length: 500 }, (_, index) => `folder-${String(index).padStart(4, "0")}`)));
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={vi.fn()}/>);

    const list = await screen.findByRole("list", { name: "远程目录 /srv/project" });
    expect(list).toHaveAttribute("aria-setsize", "500");
    expect(within(list).getAllByRole("listitem").length).toBeLessThan(500);
  });

  it("cancels without selecting and exposes dialog semantics", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={onClose} onSelect={onSelect}/>);
    const dialog = screen.getByRole("dialog", { name: "选择远程仓库目录" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const cancel = await screen.findByRole("button", { name: "取消" });
    expect(cancel).toHaveClass("ui-button--danger");
    await user.click(cancel);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
  });
});
