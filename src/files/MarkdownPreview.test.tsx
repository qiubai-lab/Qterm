import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownPreview } from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders Markdown without loading embedded remote images", () => {
    render(<MarkdownPreview content={'# Hello\n\n![secret](https://example.com/remote.png)'}/>);

    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("[图片已禁用：secret]")).toBeInTheDocument();
  });
});
