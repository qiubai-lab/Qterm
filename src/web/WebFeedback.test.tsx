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
  expect(screen.getByRole("status")).toHaveTextContent("加载23项资源 · 耗时1.26秒");
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
  expect(screen.getByRole("status")).not.toHaveTextContent("耗时1.26秒");
  view.rerender(<WebFeedback {...props} metrics={metrics} loadState="stopped"/>);
  expect(screen.getByRole("status")).toHaveTextContent("已停止加载");
  view.rerender(<WebFeedback {...props} loadState="failed"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("网页加载失败");
  view.rerender(<WebFeedback {...props} connected={false} ready={false} loadState="failed" metrics={metrics}/>);
  expect(screen.getByRole("status")).toHaveTextContent("连接后可访问远程网络");
  expect(screen.getByRole("status")).not.toHaveTextContent("23");
});

it("prioritizes errors and uses zero placeholders when sampling is unavailable", () => {
  render(<WebFeedback {...props} feedback="SSH 连接已断开"/>);
  expect(screen.getByRole("alert")).toHaveTextContent("SSH 连接已断开");
  expect(screen.getByRole("alert")).toHaveTextContent("加载0项资源 · 耗时0秒");
});

it("renders compact right-aligned metrics with natural width", () => {
  const view = render(<WebFeedback {...props} metrics={{ ...metrics, resources: 59, loadMs: 1800 }}/>);
  expect(view.container.querySelector(".web-feedback-metrics")).toHaveTextContent("加载59项资源 · 耗时1.80秒");
  view.rerender(<WebFeedback {...props} ready={false}/>);
  expect(view.container.querySelector(".web-feedback-metrics")).toHaveTextContent("加载0项资源 · 耗时0秒");
  const css = readFileSync("src/web/webFeedback.css", "utf8");
  expect(css).toContain("margin-left: auto");
  expect(css).not.toContain("grid-template-columns");
});
