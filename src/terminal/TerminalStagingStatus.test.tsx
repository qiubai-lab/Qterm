import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TerminalStagingStatus } from "./TerminalStagingStatus";

describe("TerminalStagingStatus", () => {
  it("keeps every card slot mounted while a transfer is visible", () => {
    const onStop = vi.fn();
    const view = render(<TerminalStagingStatus state={{ phase: "uploading", displayName: "model.bin", transferredBytes: 512, totalBytes: 1024 }} closing={false} canStop onStop={onStop}/>);
    const status = screen.getByRole("status", { name: "终端文件上传状态" });
    expect(status).toHaveTextContent("正在上传model.bin");
    expect(status.querySelector(":scope > .terminal-staging-status-icon")).not.toBeNull();
    expect(status.querySelector(".terminal-staging-status-icon svg")).toHaveAttribute("width", "10");
    const text = status.querySelector(".terminal-staging-status-copy");
    expect(text?.firstElementChild).toHaveTextContent("正在上传");
    expect(text?.lastElementChild).toHaveTextContent("model.bin");
    expect(status.querySelector(".terminal-staging-status-copy")?.nextElementSibling).toHaveClass("terminal-staging-stop");
    expect(status.querySelector(".terminal-staging-stop")?.nextElementSibling).toHaveClass("terminal-staging-progress-row");
    expect(status.querySelector(".terminal-staging-progress-row")?.children).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "上传进度" })).toHaveValue(50);
    const stop = screen.getByRole("button", { name: "停止上传" });
    expect(stop.querySelector("span")).toBeNull();
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalledOnce();
    view.rerender(<TerminalStagingStatus state={{ phase: "pasted", displayName: "model.bin", transferredBytes: 1024, totalBytes: 1024 }} closing canStop={false} onStop={onStop}/>);
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveAttribute("data-state", "closing");
    view.unmount();
  });

  it("presents uploaded and path-pasted as distinct transient states", () => {
    const view = render(<TerminalStagingStatus state={{ phase: "uploaded", itemCount: 2, totalBytes: 4096, transferredBytes: 4096 }} closing={false} canStop={false} onStop={vi.fn()}/>);
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("上传成功");
    view.rerender(<TerminalStagingStatus state={{ phase: "pasted", itemCount: 2, totalBytes: 4096, transferredBytes: 4096 }} closing={false} canStop={false} onStop={vi.fn()}/>);
    expect(screen.getByRole("status", { name: "终端文件上传状态" })).toHaveTextContent("路径已粘贴");
    view.unmount();
  });

  it.each([
    ["preparing", "准备上传"],
    ["scanning", "正在扫描"],
    ["stopping", "正在停止"],
    ["cancelled", "上传已停止"],
    ["failed", "上传失败"],
  ] as const)("presents the %s phase without replacing the component", (phase, label) => {
    const view = render(<TerminalStagingStatus state={{ phase, itemCount: 3, message: "测试错误" }} closing={false} canStop={phase === "scanning"} onStop={vi.fn()}/>);
    const status = screen.getByRole("status", { name: "终端文件上传状态" });
    expect(status).toHaveAttribute("data-phase", phase);
    expect(status).toHaveTextContent(label);
    expect(screen.getByRole("button", { name: "停止上传" })).toBeInTheDocument();
    view.unmount();
  });
});
