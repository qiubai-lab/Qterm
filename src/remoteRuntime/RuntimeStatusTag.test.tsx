import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeStatusTag } from "./RuntimeStatusTag";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("pauses the connected status animation when the desktop loses focus", () => {
  const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  render(<RuntimeStatusTag entry={{id:"a",name:"开发服务器",endpoint:"https://server.example"}} status="已连接"/>);
  const tag = screen.getByLabelText("开发服务器，已连接");
  focus.mockReturnValue(false);
  fireEvent(window, new Event("blur"));
  expect(tag).toHaveAttribute("data-paused", "true");
  focus.mockReturnValue(true);
  fireEvent(window, new Event("focus"));
  expect(tag).not.toHaveAttribute("data-paused");
});
