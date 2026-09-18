import html from "../../site/index.html?raw";
import script from "../../site/public/image-viewer.js?raw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeEach(() => {
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  // jsdom does not implement the native dialog lifecycle; browser QA covers focus trapping/Esc.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  } });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn() }));
  // Pseudo-element computed styles are unavailable in jsdom.
  const compute = window.getComputedStyle.bind(window);
  vi.stubGlobal("getComputedStyle", (element: Element) => compute(element));
  new Function(script)();
  const stage = document.querySelector(".image-viewer-stage")!;
  Object.defineProperties(stage, { clientWidth: { value: 400 }, clientHeight: { value: 600 }, scrollWidth: { value: 1206 }, scrollHeight: { value: 737 } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const [name, descriptor] of [["showModal", originalShow], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  document.body.innerHTML = "";
  document.documentElement.classList.remove("image-viewer-open");
});

describe("site image viewer", () => {
  it("opens original images in one dialog without navigation and restores focus on close", () => {
    const link = document.querySelector<HTMLAnchorElement>("#panel-paste-image [data-image-viewer]")!;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    const dialog = document.querySelector("dialog")!;
    expect(click.defaultPrevented).toBe(true);
    expect(dialog).toHaveAttribute("open");
    expect(dialog.querySelector("img")).toHaveAttribute("src", link.href);
    expect(dialog.querySelector("img")).toHaveAttribute("alt", link.querySelector("img")!.alt);
    expect(document.documentElement).toHaveClass("image-viewer-open");
    dialog.querySelector<HTMLButtonElement>("[data-close]")!.click();
    expect(dialog).not.toHaveAttribute("open");
    expect(document.documentElement).not.toHaveClass("image-viewer-open");
    expect(document.activeElement).toBe(link);
  });
  it("resets zoom and content for the next screenshot, including the hero and export images", () => {
    document.querySelector<HTMLAnchorElement>(".site-preview [data-image-viewer]")!.click();
    const dialog = document.querySelector("dialog")!;
    const stage = dialog.querySelector<HTMLElement>(".image-viewer-stage")!;
    stage.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(dialog).toHaveClass("image-viewer-zoomed");
    dialog.close();
    const exportLink = document.querySelector<HTMLAnchorElement>(".export-card [data-image-viewer]")!;
    exportLink.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    expect(dialog).toHaveAttribute("open");
    expect(dialog).not.toHaveClass("image-viewer-zoomed");
    expect(dialog.querySelector("img")).toHaveAttribute("src", exportLink.href);
    expect(document.querySelectorAll("dialog")).toHaveLength(1);
  });
  it("closes on a backdrop click but not on the image or a drag ending outside", () => {
    document.querySelector<HTMLAnchorElement>("[data-image-viewer]")!.click();
    const dialog = document.querySelector("dialog")!;
    const image = dialog.querySelector("img")!;
    image.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    image.click();
    expect(dialog).toHaveAttribute("open");
    image.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.click();
    expect(dialog).toHaveAttribute("open");
    dialog.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.click();
    expect(dialog).not.toHaveAttribute("open");
  });
  it("toggles zoom on double click and hides thin scroll indicators after inactivity", () => {
    vi.useFakeTimers();
    document.querySelector<HTMLAnchorElement>("[data-image-viewer]")!.click();
    const dialog = document.querySelector("dialog")!;
    const image = dialog.querySelector("img")!;
    image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: 150, clientY: 200 }));
    expect(dialog).toHaveClass("image-viewer-zoomed", "image-viewer-scrolling");
    expect(parseFloat(image.style.width)).toBe(1206);
    vi.advanceTimersByTime(1100);
    expect(dialog).not.toHaveClass("image-viewer-scrolling");
    dialog.querySelector(".image-viewer-stage")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(dialog).not.toHaveClass("image-viewer-zoomed");
    expect(parseFloat(image.style.width)).toBeCloseTo(400);
    dialog.close();
    vi.runAllTimers();
    expect(dialog).not.toHaveClass("image-viewer-scrolling");
  });
  it("drags a zoomed image and clears the drag when the pointer is cancelled", () => {
    document.querySelector<HTMLAnchorElement>("[data-image-viewer]")!.click();
    const dialog = document.querySelector("dialog")!;
    const image = dialog.querySelector("img")!;
    const stage = dialog.querySelector<HTMLElement>(".image-viewer-stage")!;
    stage.setPointerCapture = vi.fn();
    image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    stage.scrollLeft = 200;
    stage.scrollTop = 100;
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: "mouse" } });
      stage.dispatchEvent(event);
    };
    pointer("pointerdown", 100, 100);
    pointer("pointermove", 60, 70);
    expect(stage.scrollLeft).toBe(240);
    expect(stage.scrollTop).toBe(130);
    pointer("pointercancel", 60, 70);
    pointer("pointermove", 20, 20);
    expect(stage.scrollLeft).toBe(240);
    expect(dialog).not.toHaveClass("image-viewer-dragging");
  });
  it("supports touch double taps without toggling again on a synthesized double click", () => {
    document.querySelector<HTMLAnchorElement>("[data-image-viewer]")!.click();
    const dialog = document.querySelector("dialog")!;
    const image = dialog.querySelector("img")!;
    for (let tap = 0; tap < 2; tap++) {
      for (const type of ["pointerdown", "pointerup"]) {
        const event = new MouseEvent(type, { bubbles: true, clientX: 80, clientY: 80 });
        Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: "touch" } });
        image.dispatchEvent(event);
      }
      image.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    }
    expect(dialog).toHaveClass("image-viewer-zoomed");
    image.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(dialog).toHaveClass("image-viewer-zoomed");
  });

  it("keeps the image and scroll lock until the closing animation finishes, including Escape during opening", () => {
    vi.useFakeTimers();
    document.querySelector("dialog")!.remove();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn() }));
    // Use fresh links so only the new viewer owns their handlers.
    document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
    new Function(script)();
    const link = document.querySelector<HTMLAnchorElement>("[data-image-viewer]")!;
    link.click();
    const dialog = document.querySelector("dialog")!;
    expect(dialog).toHaveClass("image-viewer-visible");
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog).toHaveAttribute("open");
    expect(dialog.querySelector("img")).toHaveAttribute("src");
    expect(document.documentElement).toHaveClass("image-viewer-open");
    dialog.querySelector<HTMLButtonElement>("[data-close]")!.click();
    vi.advanceTimersByTime(220);
    expect(dialog).not.toHaveAttribute("open");
    expect(document.activeElement).toBe(link);
    link.click();
    vi.runAllTimers();
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveClass("image-viewer-visible");
  });

});
