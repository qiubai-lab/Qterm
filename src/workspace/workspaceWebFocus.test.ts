import { afterEach, expect, it, vi } from "vitest";
import { focusWorkspaceBlock } from "./workspaceFocus";

vi.mock("../terminal/terminalViewRegistry", () => ({ focusTerminalBlock: () => false }));
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });

it("preserves native webpage focus after activation but restores shell focus from a tab", () => {
  const block = document.createElement("section");
  block.dataset.layoutBlock = "web"; block.className = "web-block"; block.tabIndex = 0;
  document.body.append(block);
  const focus = vi.spyOn(block, "focus");
  const documentFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
  expect(focusWorkspaceBlock("web")).toBe(true);
  expect(focus).not.toHaveBeenCalled();
  documentFocus.mockReturnValue(true);
  focusWorkspaceBlock("web");
  expect(focus).toHaveBeenCalledOnce();
});
