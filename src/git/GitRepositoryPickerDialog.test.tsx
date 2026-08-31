import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GitRepositoryPickerDialog } from "./GitRepositoryPickerDialog";

const api = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("../lib/tauri/git", () => ({
  listRemoteGitDirectory: api.list,
  gitError: (error: unknown) => error as { code: string; message: string },
}));

function listing(path: string, names: string[]) {
  return {
    path,
    entries: names.map((name) => ({ name, path: `${path.replace(/\/$/, "")}/${name}`, isSymlink: false })),
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
  });

  it("browses directories with history without changing the Git target", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={onSelect}/>);

    expect(await screen.findByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith("git-session", "profile-1", "/srv/project");

    await user.click(screen.getByRole("button", { name: "打开目录 alpha" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project/alpha" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "远程仓库路径" })).toHaveValue("/srv/project/alpha");

    await user.click(screen.getByRole("button", { name: "后退" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "前进" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project/alpha" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "返回上级目录" }));
    expect(await screen.findByRole("list", { name: "远程目录 /srv/project" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "刷新目录" }));

    expect(api.list).toHaveBeenLastCalledWith("git-session", "profile-1", "/srv/project");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps manual path confirmation available when SFTP browsing fails", async () => {
    const user = userEvent.setup();
    api.list.mockRejectedValue({ code: "directoryUnavailable", message: "服务器未开放 SFTP" });
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={onSelect}/>);

    expect(await screen.findByRole("alert")).toHaveTextContent("服务器未开放 SFTP");
    expect(screen.getByText("仍可直接输入远程路径并选择")).toBeInTheDocument();
    const path = screen.getByRole("textbox", { name: "远程仓库路径" });
    await user.clear(path);
    await user.type(path, "/opt/repos/manual");
    await user.click(screen.getByRole("button", { name: "选择此路径" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("/opt/repos/manual");
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
    const path = screen.getByRole("textbox", { name: "远程仓库路径" });

    await user.clear(path);
    await user.type(path, "/slow");
    await user.click(screen.getByRole("button", { name: "转到输入路径" }));
    await user.clear(path);
    await user.type(path, "/fast");
    await user.click(screen.getByRole("button", { name: "转到输入路径" }));

    fast.resolve(listing("/fast", ["latest"]));
    expect(await screen.findByRole("list", { name: "远程目录 /fast" })).toBeInTheDocument();
    slow.resolve(listing("/slow", ["stale"]));
    await waitFor(() => expect(screen.getByRole("list", { name: "远程目录 /fast" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "打开目录 stale" })).not.toBeInTheDocument();
  });

  it("uses bounded rendering for large directory listings", async () => {
    api.list.mockResolvedValue(listing("/srv/project", Array.from({ length: 500 }, (_, index) => `folder-${String(index).padStart(4, "0")}`)));
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={vi.fn()} onSelect={vi.fn()}/>);

    const list = await screen.findByRole("list", { name: "远程目录 /srv/project" });
    expect(list).toHaveAttribute("aria-setsize", "500");
    expect(within(list).getAllByRole("button").length).toBeLessThan(500);
  });

  it("cancels without selecting and exposes dialog semantics", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<GitRepositoryPickerDialog sessionId="git-session" profileId="profile-1" initialPath="/srv/project" onClose={onClose} onSelect={onSelect}/>);
    const dialog = screen.getByRole("dialog", { name: "选择远程仓库目录" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await user.click(await screen.findByRole("button", { name: "取消" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
  });
});
