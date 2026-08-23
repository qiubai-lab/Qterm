import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button, IconButton, StatusBadge } from "./Button";
import { Icon } from "./Icon";

describe("shared buttons", () => {
  it("maps semantic variants and density without losing native button behavior", () => {
    render(<Button variant="primary" size="compact">保存配置</Button>);
    const button = screen.getByRole("button", { name: "保存配置" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveClass("ui-button", "ui-button--primary", "ui-button--compact");
  });

  it("makes loading actions busy and unavailable", () => {
    render(<Button loading>保存中…</Button>);
    const button = screen.getByRole("button", { name: "保存中…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("requires an accessible label for icon-only actions", () => {
    render(<IconButton label="关闭"><Icon name="close"/></IconButton>);
    expect(screen.getByRole("button", { name: "关闭" })).toHaveClass("ui-icon-button");
  });

  it("keeps persistent status non-interactive", () => {
    render(<StatusBadge tone="success">凭证库已解锁</StatusBadge>);
    expect(screen.getByText("凭证库已解锁")).toHaveClass("ui-status-badge", "ui-status-badge--success");
    expect(screen.queryByRole("button", { name: "凭证库已解锁" })).not.toBeInTheDocument();
  });
});
