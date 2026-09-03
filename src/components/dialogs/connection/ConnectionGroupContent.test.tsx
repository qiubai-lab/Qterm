import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionGroupContent } from "./ConnectionGroupContent";

let visibleHeight = 0;
const animations: Array<{ cancel: ReturnType<typeof vi.fn>; finish: () => void }> = [];
const animate = vi.fn<(keyframes: Keyframe[], options: KeyframeAnimationOptions) => { cancel: ReturnType<typeof vi.fn>; finished: Promise<void> }>(() => {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const cancel = vi.fn();
  animations.push({ cancel, finish });
  return { cancel, finished };
});

beforeEach(() => {
  visibleHeight = 0;
  animations.length = 0;
  animate.mockClear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { height: this.classList.contains("connection-group-items") ? 120 : visibleHeight } as DOMRect;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
});

async function finish(index: number) {
  await act(async () => { animations[index].finish(); });
}

describe("ConnectionGroupContent", () => {
  it("animates both directions and makes exiting content inert until removal", async () => {
    const { container, rerender } = render(<ConnectionGroupContent expanded={false}><button>连接</button></ConnectionGroupContent>);
    expect(screen.queryByText("连接")).not.toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();

    rerender(<ConnectionGroupContent expanded><button>连接</button></ConnectionGroupContent>);
    const body = container.firstElementChild!;
    expect(screen.getByRole("button", { name: "连接" })).toBeInTheDocument();
    expect(animate.mock.calls[0]).toEqual([
      [{ height: "0px", opacity: "0" }, { height: "120px", opacity: 1 }],
      { duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" },
    ]);
    expect(body).toHaveAttribute("data-animating", "true");
    await finish(0);
    expect(body).not.toHaveAttribute("data-animating");

    visibleHeight = 120;
    rerender(<ConnectionGroupContent expanded={false}><button>连接</button></ConnectionGroupContent>);
    expect(body).toHaveAttribute("inert");
    expect(body).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("连接")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "连接" })).not.toBeInTheDocument();
    await finish(1);
    expect(screen.queryByText("连接")).not.toBeInTheDocument();
    expect(body).toHaveStyle({ height: "0px", opacity: "0" });
    expect(body).not.toHaveAttribute("data-animating");
  });

  it("reverses from the current height and ignores an obsolete close completion", async () => {
    const { container, rerender } = render(<ConnectionGroupContent expanded><button>连接</button></ConnectionGroupContent>);
    visibleHeight = 120;
    rerender(<ConnectionGroupContent expanded={false}><button>连接</button></ConnectionGroupContent>);
    visibleHeight = 48;
    rerender(<ConnectionGroupContent expanded><button>连接</button></ConnectionGroupContent>);
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    expect(animate.mock.calls[1][0]).toEqual([
      { height: "48px", opacity: "0" }, { height: "120px", opacity: 1 },
    ]);
    await finish(0);
    expect(container.firstElementChild).toHaveAttribute("data-animating", "true");
    expect(screen.getByRole("button", { name: "连接" })).toBeInTheDocument();
    await finish(1);
    expect(container.firstElementChild).not.toHaveAttribute("data-animating");
    expect(container.firstElementChild).toHaveStyle({ height: "auto" });
  });

  it.each(["reduced motion", "missing API", "keyboard"])("switches immediately for %s", (mode) => {
    if (mode === "reduced motion") vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    if (mode === "missing API") Reflect.deleteProperty(HTMLElement.prototype, "animate");
    const { rerender } = render(<><button className="connection-group-toggle">分组</button><ConnectionGroupContent expanded={false}><button>连接</button></ConnectionGroupContent></>);
    if (mode === "keyboard") screen.getByRole("button", { name: "分组" }).focus();
    rerender(<><button className="connection-group-toggle">分组</button><ConnectionGroupContent expanded><button>连接</button></ConnectionGroupContent></>);
    expect(screen.getByRole("button", { name: "连接" })).toBeInTheDocument();
    visibleHeight = 120;
    rerender(<><button className="connection-group-toggle">分组</button><ConnectionGroupContent expanded={false}><button>连接</button></ConnectionGroupContent></>);
    expect(screen.queryByText("连接")).not.toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });

  it("cancels an unfinished transition on unmount", async () => {
    const { rerender, unmount } = render(<ConnectionGroupContent expanded={false}>连接</ConnectionGroupContent>);
    rerender(<ConnectionGroupContent expanded>连接</ConnectionGroupContent>);
    unmount();
    expect(animations[0].cancel).toHaveBeenCalledOnce();
    await finish(0);
    expect(screen.queryByText("连接")).not.toBeInTheDocument();
  });
});
