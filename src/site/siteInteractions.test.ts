import html from "../../site/index.html?raw";
import script from "../../site/public/site-interactions.js?raw";
import { afterEach, describe, expect, it, vi } from "vitest";

function mount(reduced = false) {
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>"));
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: vi.fn() }));
  new Function(script)();
  return Array.from(document.querySelectorAll<HTMLButtonElement>("[role=tab]"));
}
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });
describe("introduction progressive enhancement", () => {
  it("keeps all feature content accessible before JavaScript runs", () => {
    document.body.innerHTML = html;
    expect(document.querySelectorAll(".workflow-panel")).toHaveLength(3);
    expect(document.querySelectorAll(".workflow-panel[hidden]")).toHaveLength(0);
  });
  it("switches panels by click and wraps keyboard navigation with focus", () => {
    const tabs = mount();
    tabs[1].click();
    expect(document.getElementById("panel-network")).not.toHaveAttribute("hidden");
    expect(document.getElementById("panel-files")).toHaveAttribute("hidden");
    tabs[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(tabs[2]);
    tabs[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(tabs[0]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2].tabIndex).toBe(-1);
  });
  it("does not animate or hide sections when reduced motion is requested", () => {
    const animate = vi.fn();
    vi.stubGlobal("IntersectionObserver", vi.fn());
    const original = Element.prototype.animate;
    Element.prototype.animate = animate;
    try {
      mount(true)[2].click();
      expect(animate).not.toHaveBeenCalled();
      expect(document.querySelector(".reveal-pending")).toBeNull();
    } finally { Element.prototype.animate = original; }
  });
});
