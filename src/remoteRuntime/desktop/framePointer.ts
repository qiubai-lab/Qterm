/** Pointer events do not bubble out of a browsing context. Report only the interaction,
 * without redispatching the pointer or changing focus in the terminal. */
export const workbenchPointerDown = "qterm:workbench-pointerdown";

export function reportWorkbenchPointer(event: Event) {
  const member = event.currentTarget as Window;
  member.frameElement?.dispatchEvent(new Event(workbenchPointerDown, { bubbles: true }));
}
