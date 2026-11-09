import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTerminalCopy } from "./useTerminalCopy";
import type { TerminalView } from "./terminalView";
afterEach(cleanup);
const write = vi.hoisted(() => vi.fn());
vi.mock("@qterm/services/textClipboard", () => ({ writeText: write }));

it("offers selectable text after failure, closes the menu without stealing focus, and restores focus on dismissal", async () => {
  write.mockRejectedValue(new Error("denied"));
  const closeMenu = vi.fn(), restore = vi.fn();
  const view = { current: { terminal: { hasSelection: () => true, getSelection: () => "output\nnext" } } as unknown as TerminalView };
  function Harness() {
    const { copy, dialog } = useTerminalCopy(view, "session", closeMenu, restore);
    return <><button onClick={copy}>复制</button>{dialog}</>;
  }
  render(<Harness/>);
  await act(async () => { fireEvent.click(screen.getByText("复制")); });
  expect(closeMenu).toHaveBeenCalledWith(false);
  const field = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(field).toHaveFocus(); expect(field.value).toBe("output\nnext");
  expect(field.selectionEnd).toBe(field.value.length);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull(); expect(restore).toHaveBeenCalledOnce();
});

it("does not expose stale text after the session changes", async () => {
  let reject!: (reason: Error) => void;
  write.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
  const view = { current: { terminal: { hasSelection: () => true, getSelection: () => "old" } } as unknown as TerminalView };
  function Harness({ session }: { session: string }) {
    const { copy, dialog } = useTerminalCopy(view, session, vi.fn(), vi.fn());
    return <><button onClick={copy}>复制</button>{dialog}</>;
  }
  const mounted = render(<Harness session="old"/>);
  fireEvent.click(screen.getByText("复制"));
  mounted.rerender(<Harness session="new"/>);
  await act(async () => { reject(new Error("denied")); });
  expect(screen.queryByRole("dialog")).toBeNull();
});
