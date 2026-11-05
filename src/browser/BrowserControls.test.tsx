import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserInterface } from "./BrowserInterface";
import { BrowserControls } from "./BrowserControls";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup(supported=true) {
  const request=vi.fn().mockResolvedValue(undefined), exit=vi.fn().mockResolvedValue(undefined);
  vi.spyOn(document, "fullscreenEnabled", "get").mockReturnValue(supported);
  Object.defineProperty(document.documentElement,"requestFullscreen",{configurable:true,value:request});
  Object.defineProperty(document,"exitFullscreen",{configurable:true,value:exit});
  render(<BrowserInterface enabled><BrowserControls/></BrowserInterface>);
  return {request,exit};
}
Object.defineProperty(document,"fullscreenEnabled",{configurable:true,get:()=>false});
Object.defineProperty(document,"fullscreenElement",{configurable:true,get:()=>null});
it("enters only on an explicit click and follows real fullscreen events including browser exit", async () => {
  const {request,exit}=setup();
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"进入浏览器全屏"}));
  await waitFor(()=>expect(request).toHaveBeenCalledOnce());
  const element=vi.spyOn(document,"fullscreenElement","get").mockReturnValue(document.documentElement);
  act(()=>document.dispatchEvent(new Event("fullscreenchange")));
  await waitFor(()=>expect(screen.getByRole("button",{name:"退出浏览器全屏"})).toBeEnabled());
  fireEvent.click(screen.getByRole("button",{name:"退出浏览器全屏"}));
  await waitFor(()=>expect(exit).toHaveBeenCalledOnce());
  element.mockReturnValue(null);act(()=>document.dispatchEvent(new Event("fullscreenchange")));
  expect(screen.getByRole("button",{name:"进入浏览器全屏"})).toHaveAttribute("aria-pressed","false");
});
it("reports denial and allows retry without claiming fullscreen", async () => {
  const {request}=setup();request.mockRejectedValueOnce(new Error("Denied"));
  fireEvent.click(screen.getByRole("button",{name:"进入浏览器全屏"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("未能切换全屏");
  expect(screen.getByRole("button",{name:"进入浏览器全屏"})).toBeEnabled();
});
it("keeps display settings available when fullscreen is unsupported", () => {
  setup(false);
  expect(screen.queryByRole("button",{name:"进入浏览器全屏"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"浏览器显示设置"})).toBeEnabled();
});
