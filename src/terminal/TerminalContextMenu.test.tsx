import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalContextMenu } from "./TerminalContextMenu";

afterEach(cleanup);
it("enables export only for selections and supports keyboard navigation to it", () => {
  const actions = { copy: vi.fn(), paste: vi.fn(), exportImage: vi.fn(), search: vi.fn(), selectAll: vi.fn(), clear: vi.fn() };
  const props = { menuRef: createRef<HTMLDivElement>(), platform: "macos" as const, canPaste: true, actions, close: vi.fn() };
  const state = { x: 10, y: 20, placement: "below" as const, hasSelection: false };
  const view = render(<TerminalContextMenu {...props} state={state}/>);
  expect(screen.getByRole("menuitem", { name: "导出选中行为图片…" })).toBeDisabled();
  view.rerender(<TerminalContextMenu {...props} state={{ ...state, hasSelection: true }}/>);
  screen.getByRole("menuitem", { name: /复制/ }).focus();
  fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
  const exportAction = screen.getByRole("menuitem", { name: "导出选中行为图片…" });
  expect(exportAction).toHaveFocus();
  fireEvent.click(exportAction);
  expect(actions.exportImage).toHaveBeenCalledOnce();
  expect(actions.copy).not.toHaveBeenCalled();
});
