import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalContextMenu } from "../terminal/TerminalContextMenu";
import { webSurfaceVisible } from "./webModel";
import { webSurfaceOcclusions } from "./webSurfaceOcclusion";

afterEach(() => { cleanup(); document.body.innerHTML = ""; vi.restoreAllMocks(); });

it("keeps a neighboring webpage visible when the real terminal menu opens", () => {
  render(<TerminalContextMenu state={{ x: 0, y: 0, placement: "below", hasSelection: false }}
    menuRef={createRef()} platform="windows" canPaste={false} close={() => {}}
    actions={{ copy() {}, paste() {}, exportImage() {}, search() {}, selectAll() {}, clear() {} }}/>);
  const menu = screen.getByRole("menu");
  vi.spyOn(menu, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
  expect(webSurfaceVisible(document.body, true)).toBe(true);
  expect(webSurfaceOcclusions(new DOMRect(500, 100, 400, 400))).toEqual([]);
  expect(webSurfaceOcclusions(new DOMRect(50, 50, 400, 400))).toEqual([{ x: 0, y: 0, width: 50, height: 50 }]);
});

it.each(["display:none", "visibility:hidden", "opacity:0"])("ignores unpainted nonmodal dialogs: %s", style => {
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "false");
  dialog.setAttribute("style", style); document.body.append(dialog);
  expect(webSurfaceVisible(document.body, true)).toBe(true);
});
