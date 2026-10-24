import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { WebFeedback } from "./WebFeedback";
// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";

afterEach(cleanup);
const props = { feedback: "", loading: false, ready: true, connected: true };
const metrics = { url: "https://host/", documentId: 1000, resources: 23, loadMs: 1260 };

it("keeps page state and completed resource counts visible without any overlay or dismissal", () => {
  const view = render(<WebFeedback {...props} metrics={metrics}/>);
  expect(screen.getByRole("status")).toHaveTextContent("已加载");
  expect(screen.getByRole("status")).toHaveTextContent("已完成 23 项资源 · 1.26 s");
  expect(view.container.firstChild).not.toHaveAttribute("data-web-native-overlay");
  view.rerender(<WebFeedback {...props} metrics={metrics}/>);
  expect(screen.getByRole("status")).toBeVisible();
  const css = readFileSync("src/web/webFeedback.css", "utf8");
  expect(css).toContain("flex: 0 0 24px");
  expect(css).not.toContain("position: absolute");
  expect(css).not.toContain("translateY");
});

it("shows loading, stopped, failed and disconnected states without stale duration", () => {
  const view = render(<WebFeedback {...props} metrics={metrics} loading/>);
  expect(screen.getByRole("status")).toHaveTextContent("正在加载网页");
  expect(screen.getByRole("status")).not.toHaveTextContent("1.26 s");
  view.rerender(<WebFeedback {...props} metrics={metrics} loadState="stopped"/>);
  expect(screen.getByRole("status")).toHaveTextContent("已停止加载");
  view.rerender(<WebFeedback {...props} loadState="failed"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("网页加载失败");
  view.rerender(<WebFeedback {...props} connected={false} ready={false} loadState="failed" metrics={metrics}/>);
  expect(screen.getByRole("status")).toHaveTextContent("连接后可访问远程网络");
  expect(screen.getByRole("status")).not.toHaveTextContent("23");
});

it("prioritizes errors and does not invent zero resource counts when sampling is unavailable", () => {
  render(<WebFeedback {...props} feedback="SSH 连接已断开"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("SSH 连接已断开");
  expect(screen.getByRole("alert")).not.toHaveTextContent("已完成 0");
});
