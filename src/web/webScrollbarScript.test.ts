// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";

const script = readFileSync("src-tauri/src/infrastructure/web/scrollbar_script.mjs", "utf8");
const invoke = new Function("document", "window", "palette", `(${script})(palette);`);
const palette = [[16, 32, 48, 255], [48, 64, 80, 255], [80, 96, 112, 255]];

function fixture() {
  const page = document.implementation.createHTMLDocument();
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  const guest = Object.assign(new EventTarget(), {
    top: null as unknown,
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; }),
    cancelAnimationFrame: vi.fn((id: number) => { frames.delete(id); }),
  });
  guest.top = guest;
  const install = (colors?: number[][]) => invoke(page, guest, colors);
  const flush = async () => {
    await Promise.resolve();
    const work = [...frames.values()]; frames.clear();
    for (const callback of work) callback(0);
    await Promise.resolve();
  };
  const style = () => page.querySelector<HTMLStyleElement>("style#qterm-native-scrollbars");
  return { page, guest, frames, install, flush, style };
}

it("automatically repairs removed/edited styles and replaced heads with the latest palette", async () => {
  const f = fixture();
  f.install();
  expect(f.style()?.textContent).toContain("width: 3px");
  expect(f.style()?.textContent).toContain("scrollbar-width: auto !important");
  expect(f.style()?.textContent).toContain("::-webkit-scrollbar-button");
  f.install(palette);
  for (const change of [
    () => f.style()!.remove(),
    () => { f.style()!.textContent = ""; },
    () => { f.style()!.firstChild!.textContent = "body {}"; },
    () => f.page.head.replaceWith(f.page.createElement("head")),
    () => { f.style()!.media = "not all"; f.style()!.type = "text/plain"; },
    () => { f.style()!.id = "page-rewritten-id"; },
    () => { f.page.body.append(f.style()!); },
  ]) {
    change();
    await f.flush();
    expect(f.page.querySelectorAll("#qterm-native-scrollbars")).toHaveLength(1);
    expect(f.style()?.textContent).toContain("rgba(16,32,48,1)");
    expect(f.style()?.media).toBe("");
    expect(f.style()?.type).toBe("");
  }
  f.guest.dispatchEvent(new Event("pagehide"));
});

it("survives replacement of html and preserves installation before DOMContentLoaded", async () => {
  const f = fixture();
  f.page.documentElement.remove();
  f.install(palette);
  expect(f.style()).toBeNull();
  f.page.append(f.page.createElement("html"));
  await Promise.resolve();
  expect(f.style()?.textContent).toContain("rgba(16,32,48,1)");
  f.page.documentElement.append(f.page.createElement("head"), f.page.createElement("body"));
  await f.flush();
  const root = f.page.createElement("html");
  root.append(f.page.createElement("head"), f.page.createElement("body"));
  f.page.documentElement.replaceWith(root);
  await f.flush();
  expect(f.style()?.parentElement).toBe(f.page.head);
  expect(f.style()?.textContent).toContain("rgba(16,32,48,1)");
  f.guest.dispatchEvent(new Event("pagehide"));
});

it("coalesces repairs, avoids body mutation work and never lets an old theme take over", async () => {
  const f = fixture();
  f.install();
  for (let i = 0; i < 20; i++) f.install(palette);
  await f.flush();
  f.guest.requestAnimationFrame.mockClear();
  const owned = f.style();
  for (let i = 0; i < 100; i++) f.page.body.append(f.page.createElement("div"));
  await f.flush();
  expect(f.guest.requestAnimationFrame).not.toHaveBeenCalled();
  expect(f.style()).toBe(owned);
  f.style()!.remove();
  for (let i = 0; i < 10; i++) f.page.head.append(f.page.createElement("meta"));
  await Promise.resolve();
  expect(f.frames.size).toBe(1);
  await f.flush();
  expect(f.style()?.textContent).toContain("rgba(16,32,48,1)");
  await f.flush();
  expect(f.frames.size).toBe(0);
  f.guest.dispatchEvent(new Event("pagehide"));
});

it("suspends pending repairs on pagehide and resumes the same palette on pageshow", async () => {
  const f = fixture();
  f.install(palette);
  f.style()!.remove();
  await Promise.resolve();
  f.guest.dispatchEvent(new Event("pagehide"));
  f.install([[1, 2, 3, 255], [4, 5, 6, 255], [7, 8, 9, 255]]);
  await f.flush();
  expect(f.frames.size).toBe(0);
  expect(f.style()).toBeNull();
  f.guest.dispatchEvent(new Event("pageshow"));
  await f.flush();
  expect(f.style()?.textContent).toContain("rgba(1,2,3,1)");
  f.guest.dispatchEvent(new Event("pagehide"));
});
