import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalHeaderActions } from "../terminal/TerminalHeaderActions";
import { isDemo } from "../lib/runtime/environment";

afterEach(cleanup);

it("keeps desktop actions available but blocks native actions in the demo", () => {
  const native = vi.fn(); const split = vi.fn();
  render(<TerminalHeaderActions closeDisabled onClose={vi.fn()} actions={[
    { label: "打开终端文件夹", icon: "files", nativeOnly: true, onSelect: native },
    { label: "左右分割", icon: "splitHorizontal", onSelect: split },
  ]}/>);
  const button = screen.getByRole("button", { name: "打开终端文件夹" });
  if (isDemo) expect(button).toBeDisabled();
  else expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(native).toHaveBeenCalledTimes(isDemo ? 0 : 1);
  fireEvent.click(screen.getByRole("button", { name: "左右分割" }));
  expect(split).toHaveBeenCalledOnce();
});
