import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExactTextArea, ExactTextInput } from "./ExactTextInput";

describe("ExactTextInput", () => {
  it("preserves machine text and enforces platform text-assistance boundaries", () => {
    const inputRef = createRef<HTMLInputElement>();
    function Harness() {
      const [value, setValue] = useState("");
      return <ExactTextInput
        ref={inputRef}
        aria-label="机器标识"
        value={value}
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        maxLength={255}
        onChange={(event) => setValue(event.target.value)}
      />;
    }

    render(<Harness/>);
    const input = screen.getByRole("textbox", { name: "机器标识" });
    expect(inputRef.current).toBe(input);
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("maxlength", "255");

    fireEvent.change(input, { target: { value: "test3" } });
    expect(input).toHaveValue("test3");
  });
});

describe("ExactTextArea", () => {
  it("preserves multiline text and enforces platform text-assistance boundaries", () => {
    const textareaRef = createRef<HTMLTextAreaElement>();
    render(<ExactTextArea
      ref={textareaRef}
      aria-label="精确多行文本"
      defaultValue="feat: preserve case"
      autoCapitalize="sentences"
      autoCorrect="on"
      spellCheck
      rows={2}
    />);

    const textarea = screen.getByRole("textbox", { name: "精确多行文本" });
    expect(textareaRef.current).toBe(textarea);
    expect(textarea).toHaveAttribute("autocapitalize", "none");
    expect(textarea).toHaveAttribute("autocorrect", "off");
    expect(textarea).toHaveAttribute("spellcheck", "false");
    expect(textarea).toHaveValue("feat: preserve case");
  });
});
