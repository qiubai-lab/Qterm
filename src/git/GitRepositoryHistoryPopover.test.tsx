import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GitRepositoryHistoryPopover } from "./GitRepositoryHistoryPopover";

const repositories = [
  { type: "local" as const, path: "D:/work/project" },
  { type: "local" as const, path: "/srv/archive/other" },
];

describe("GitRepositoryHistoryPopover", () => {
  afterEach(cleanup);

  it("shows compact repository identity, current state, and a fixed browse action", async () => {
    const user = userEvent.setup();
    const onBrowse = vi.fn();
    render(<GitRepositoryHistoryPopover
      repositories={repositories}
      currentRepository={repositories[0]}
      triggerLabel="打开本机仓库"
      onSelect={vi.fn()}
      onBrowse={onBrowse}
    />);

    const trigger = screen.getByRole("button", { name: "打开本机仓库" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "打开仓库" });
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText("最近仓库")).toBeInTheDocument();
    expect(screen.getByText("project")).toBeInTheDocument();
    expect(screen.getByText("D:/work/project")).toBeInTheDocument();
    expect(screen.getByText("other")).toBeInTheDocument();
    const current = screen.getByRole("button", { name: /project.*当前/ });
    expect(current).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("button", { name: "浏览其他目录…" }));
    expect(onBrowse).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "打开仓库" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports arrow navigation, Enter selection, Escape, and outside-pointer focus restore", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<GitRepositoryHistoryPopover
      repositories={repositories}
      currentRepository={null}
      triggerLabel="打开本机仓库"
      onSelect={onSelect}
      onBrowse={vi.fn()}
    />);
    const trigger = screen.getByRole("button", { name: "打开本机仓库" });

    await user.click(trigger);
    const first = screen.getByRole("button", { name: /project/ });
    const second = screen.getByRole("button", { name: /other/ });
    await waitFor(() => expect(first).toHaveFocus());
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(repositories[1]);
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "打开仓库" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "打开仓库" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps browsing available in the empty state and respects disabled triggers", async () => {
    const user = userEvent.setup();
    const view = render(<GitRepositoryHistoryPopover
      repositories={[]}
      currentRepository={null}
      triggerLabel="打开远程仓库"
      onSelect={vi.fn()}
      onBrowse={vi.fn()}
    />);

    await user.click(screen.getByRole("button", { name: "打开远程仓库" }));
    expect(screen.getByText("还没有成功打开的仓库")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "浏览其他目录…" })).toBeEnabled();

    view.rerender(<GitRepositoryHistoryPopover
      repositories={[]}
      currentRepository={null}
      triggerLabel="打开远程仓库"
      disabled
      onSelect={vi.fn()}
      onBrowse={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "打开远程仓库" })).toBeDisabled();
    expect(screen.queryByRole("dialog", { name: "打开仓库" })).not.toBeInTheDocument();
  });
});
