import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrowserInterface } from "./BrowserInterface";
import { useBrowserInterface } from "./browserInterfaceContext";

function Probe() {
  const { touch, showKeybar, update } = useBrowserInterface();
  return <><output>{`${touch}/${showKeybar}`}</output><button onClick={() => update({mode:"desktop",keybar:"show"})}>桌面并保留键栏</button></>;
}
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });
it("adapts to pointer changes and retains a device-local override with an independent keybar", () => {
  const media = Object.assign(new EventTarget(), { matches:true });
  vi.stubGlobal("matchMedia", () => media);
  const {unmount} = render(<BrowserInterface enabled><Probe/></BrowserInterface>);
  expect(screen.getByText("true/true")).toBeInTheDocument();
  act(() => { media.matches=false;media.dispatchEvent(new Event("change")); });
  expect(screen.getByText("false/false")).toBeInTheDocument();
  fireEvent.click(screen.getByText("桌面并保留键栏"));
  act(() => { media.matches=true;media.dispatchEvent(new Event("change")); });
  expect(screen.getByText("false/true")).toBeInTheDocument();
  unmount();
  expect(document.documentElement).not.toHaveAttribute("data-browser-interface");
  render(<BrowserInterface enabled><Probe/></BrowserInterface>);
  expect(screen.getByText("false/true")).toBeInTheDocument();
});
it("does not enable touch controls or change native window geometry when disabled", () => {
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches:true }));
  render(<BrowserInterface enabled={false}><Probe/></BrowserInterface>);
  expect(screen.getByText("false/false")).toBeInTheDocument();
  expect(document.documentElement).not.toHaveAttribute("data-browser-interface");
});
it("recovers from invalid stored preferences", () => {
  localStorage.setItem("qterm.browser-interface.v1", "null");
  render(<BrowserInterface enabled><Probe/></BrowserInterface>);
  expect(screen.getByText("false/false")).toBeInTheDocument();
});
