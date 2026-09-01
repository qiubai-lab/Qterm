import { createRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ExactTextInput } from "./ExactTextInput";

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

