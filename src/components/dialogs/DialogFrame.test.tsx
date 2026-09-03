import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import { DialogFrame } from "./DialogFrame";

afterEach(cleanup);

describe("DialogFrame stack", () => {
  it("lets Escape close only the topmost dialog", () => {
    const parentClosed = vi.fn();
    const childClosed = vi.fn();

    function Harness() {
      const [childOpen, setChildOpen] = useState(true);
      return <>
        <DialogFrame title="父弹窗" onClose={parentClosed}><button>父操作</button></DialogFrame>
        {childOpen && <DialogFrame title="子弹窗" onClose={() => { childClosed(); setChildOpen(false); }}><button>子操作</button></DialogFrame>}
      </>;
    }

    render(<Harness/>);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(childClosed).toHaveBeenCalledOnce();
    expect(parentClosed).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "父弹窗" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "子弹窗" })).not.toBeInTheDocument();
  });

  it("does not allow Escape, backdrop clicks, or a close button when non-dismissible", () => {
    const onClose = vi.fn();
    render(<DialogFrame title="终端已锁定" onClose={onClose} dismissible={false}><button>解锁终端</button></DialogFrame>);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "终端已锁定" }).parentElement!);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "关闭" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "终端已锁定" }).parentElement).toHaveClass("dialog-scrim-blocking");
  });

  it("can disable dismissal without raising a nested parent above its child", () => {
    const onClose = vi.fn();
    render(<DialogFrame title="嵌套父弹窗" onClose={onClose} dismissible={false} blocking={false}><button>父操作</button></DialogFrame>);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "嵌套父弹窗" }).parentElement!);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "嵌套父弹窗" }).parentElement).not.toHaveClass("dialog-scrim-blocking");
  });

  it("keeps its dismissal surface stable while an exit transition is running", () => {
    const onClose = vi.fn();
    render(<DialogFrame title="正在收起" onClose={onClose} closing><button>弹窗操作</button></DialogFrame>);
    const dialog = screen.getByRole("dialog", { name: "正在收起" });

    expect(dialog).toHaveAttribute("data-state", "closing");
    expect(dialog.parentElement).toHaveAttribute("data-state", "closing");
    expect(dialog.parentElement).not.toHaveClass("dialog-scrim-blocking");
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.pointerDown(dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
