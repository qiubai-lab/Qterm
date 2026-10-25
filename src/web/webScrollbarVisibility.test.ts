// @ts-expect-error Vitest runs in Node; frontend types intentionally omit Node declarations.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const policy = new Function(`return (${readFileSync("src-tauri/src/infrastructure/web/scrollbar_visibility.mjs", "utf8")});`)();

function fixture() {
  const sheet = { disabled: false };
  const root = { overflowX: "visible", overflowY: "visible", visibility: "visible", display: "block", opacity: "1", scrollbarWidth: "auto", contentVisibility: "visible" };
  const body = { overflowX: "visible", overflowY: "visible", display: "block" };
  const pseudo = { display: "inline", width: "auto", height: "auto" };
  const page = { documentElement: {}, body: {}, getElementById: () => ({ sheet }) };
  const window = { getComputedStyle(element: unknown, selector?: string) {
    expect(sheet.disabled).toBe(true);
    return selector ? pseudo : element === page.body ? body : root;
  } };
  return { sheet, root, body, pseudo, read: () => policy(page, window, page.documentElement) };
}

it("samples author styles independently of Qterm suppression and restores its stylesheet", () => {
  const f = fixture();
  expect(f.read()).toEqual({ x: true, y: true });
  expect(f.sheet.disabled).toBe(false);
  f.root.scrollbarWidth = "none";
  expect(f.read()).toEqual({ x: false, y: false });
  f.root.scrollbarWidth = "auto";
  f.pseudo.width = "0px";
  expect(f.read()).toEqual({ x: true, y: false });
  f.pseudo.width = "auto"; f.pseudo.display = "none";
  expect(f.read()).toEqual({ x: false, y: false });
  f.pseudo.display = "inline";
  expect(f.read()).toEqual({ x: true, y: true });
});

it("respects propagated body overflow and invisible root states", () => {
  const f = fixture();
  f.body.overflowY = "hidden";
  expect(f.read()).toEqual({ x: true, y: false });
  f.root.overflowY = "auto";
  expect(f.read()).toEqual({ x: true, y: true });
  for (const [key, value] of [["visibility", "hidden"], ["opacity", "0"], ["display", "none"], ["contentVisibility", "hidden"]] as const) {
    const old = f.root[key]; f.root[key] = value;
    expect(f.read()).toEqual({ x: false, y: false });
    f.root[key] = old;
  }
});

it("restores suppression even if style inspection fails", () => {
  const sheet = { disabled: false };
  expect(() => policy({ getElementById: () => ({ sheet }) }, { getComputedStyle() { throw new Error("gone"); } }, {})).toThrow("gone");
  expect(sheet.disabled).toBe(false);
});
