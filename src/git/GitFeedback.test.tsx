import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GitFeedback } from "./GitPaneSections";

describe("GitFeedback overflow tooltip", () => {
  afterEach(cleanup);

  it("shows the shared themed tooltip only when the error detail is truncated", () => {
    const detail = "fatal: could not read Username for 'https://github.com': terminal prompts disabled";
    render(<GitFeedback title="Git 操作失败" detail={detail}/>);
    const detailText = screen.getByText(detail);
    Object.defineProperties(detailText, { clientWidth: { configurable: true, value: 180 }, scrollWidth: { configurable: true, value: 520 } });

    expect(detailText).not.toHaveAttribute("title");
    fireEvent.mouseEnter(detailText);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent(detail);
    expect(detailText).toHaveAccessibleDescription(detail);
    fireEvent.mouseLeave(detailText);
    expect(tooltip).toHaveAttribute("aria-hidden", "true");
    fireEvent.focus(detailText);
    expect(screen.getByRole("tooltip")).toBe(tooltip);
    fireEvent.keyDown(detailText, { key: "Escape" });
    expect(tooltip).toHaveAttribute("aria-hidden", "true");
  });

  it("does not show a tooltip when the detail is fully visible", () => {
    const detail = "当前内容可能已过期";
    render(<GitFeedback tone="warning" title="远程连接已断开" detail={detail}/>);
    const detailText = screen.getByText(detail);
    Object.defineProperties(detailText, { clientWidth: { configurable: true, value: 220 }, scrollWidth: { configurable: true, value: 160 } });

    fireEvent.mouseEnter(detailText);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
