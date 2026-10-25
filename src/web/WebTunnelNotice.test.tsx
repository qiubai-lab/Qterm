import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { WebTunnelNotice } from "./WebTunnelNotice";

it("shows mapping and login compatibility limits on click or focus and dismisses on Escape", () => {
  render(<WebTunnelNotice/>);
  const button = screen.getByRole("button", { name: "隧道域名兼容性" });
  fireEvent.click(button);
  expect(screen.getByRole("tooltip")).toHaveTextContent("HTTPS localhost");
  expect(screen.getByRole("tooltip")).toHaveTextContent("登录回跳和 Cookie");
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.focus(button);
  expect(screen.getByRole("tooltip")).toHaveTextContent("专用隧道域名");
  fireEvent.blur(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
