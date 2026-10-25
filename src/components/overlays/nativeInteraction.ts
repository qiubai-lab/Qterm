/** Mirror a native focus/click intent at its owning DOM surface. Existing
 * outside-pointer handlers receive the correct target without a synthetic click
 * or focus restoration. No webpage content or arbitrary events cross this bridge. */
export function dispatchNativeInteraction(surface: HTMLElement) {
  surface.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
}
