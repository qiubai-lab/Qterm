import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TerminalCwdDialog } from "./TerminalCwdDialog";

describe("TerminalCwdDialog", () => {
  afterEach(cleanup);

  it("removes manual integration controls and keeps an explicit remote-home fallback", async () => {
    const onOpenFallback = vi.fn();
    const user = userEvent.setup();
    render(<TerminalCwdDialog local={false} targetName="home-dev-220" fallbackPath="." onClose={vi.fn()} onOpenFallback={onOpenFallback}/>);

    expect(screen.queryByRole("combobox", { name: "Shell 类型" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制.*集成命令/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/手动启用|不会修改 Shell 配置文件/)).not.toBeInTheDocument();
    expect(screen.getByText(".")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "从远程主目录打开" }));

    expect(onOpenFallback).toHaveBeenCalledWith(".");
  });

  it("labels an actual local PTY launch directory as the fallback", () => {
    render(<TerminalCwdDialog local targetName="本地终端" fallbackPath="C:/Users/Test" onClose={vi.fn()} onOpenFallback={vi.fn()}/>);

    expect(screen.getByText("C:/Users/Test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "从启动目录打开" })).toBeInTheDocument();
  });
});
