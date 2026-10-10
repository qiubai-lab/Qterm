import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TerminalActivityStatus } from "./TerminalActivityStatus";
import { TerminalHeaderMetadata } from "./TerminalHeaderMetadata";

const activity = vi.hoisted(() => ({ title: "Codex", progress: { state: "running" as const, value: 42 } }));
vi.mock("./useTerminalActivity", () => ({ useTerminalActivity: () => activity }));
vi.mock("./notifications/TerminalNotificationProvider", () => ({ useTerminalNotifications: () => ({ enabled: false, unread: () => false }) }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });
const progress = { state: "running" as const, value: 42 };
function finishExit(element: Element) {
  fireEvent(element, new Event("animationend", { bubbles: true })); // missing animationName must not clear it
  // React can select the WebKit event name when jsdom lacks AnimationEvent.
  for (const name of ["animationend", "webkitAnimationEnd"]) {
    const event = new Event(name, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: "terminal-progress-exit" });
    fireEvent(element, event);
  }
}

it("retains a cleared tag only visually until exit finishes", () => {
  const view = render(<TerminalActivityStatus title="" progress={progress}/>);
  const tag = screen.getByRole("progressbar");
  expect(tag).toHaveAttribute("data-presence", "open");
  view.rerender(<TerminalActivityStatus title="" progress={null}/>);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(tag).toHaveAttribute("data-presence", "closing");
  finishExit(tag.querySelector("svg")!); // bubbled child animation cannot finish the tag
  expect(tag).toBeInTheDocument();
  finishExit(tag);
  expect(tag).not.toBeInTheDocument();
});

it("cancels an old exit when a new report arrives, without replaying entry on percentage updates", () => {
  const view = render(<TerminalActivityStatus title="" progress={progress}/>);
  const tag = screen.getByRole("progressbar");
  view.rerender(<TerminalActivityStatus title="" progress={null}/>);
  act(() => vi.advanceTimersByTime(90));
  view.rerender(<TerminalActivityStatus title="" progress={{ state: "paused", value: 50 }}/>);
  finishExit(tag);
  act(() => vi.advanceTimersByTime(300));
  expect(screen.getByRole("progressbar")).toBe(tag);
  expect(tag).toHaveAccessibleName("已暂停 50%");
  view.rerender(<TerminalActivityStatus title="" progress={{ ...progress, value: 60 }}/>);
  expect(screen.getByRole("progressbar")).toBe(tag);
  expect(tag).toHaveAccessibleName("进行中 60%");
});

it("removes tags even when animation events are absent, and clears timers on unmount", () => {
  const view = render(<TerminalActivityStatus title="" progress={progress}/>);
  view.rerender(<TerminalActivityStatus title="" progress={null}/>);
  act(() => vi.advanceTimersByTime(180));
  expect(document.querySelector(".terminal-task-progress")).not.toBeInTheDocument();
  view.rerender(<TerminalActivityStatus title="" progress={progress}/>);
  view.rerender(<TerminalActivityStatus title="" progress={null}/>);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("hides titles by default, exits on disconnect and resets presence on session changes", () => {
  const view = render(<TerminalHeaderMetadata blockId="b" sessionKey="one" connected/>);
  expect(screen.queryByLabelText(/^应用标题/)).not.toBeInTheDocument();
  const tag = screen.getByRole("progressbar");
  view.rerender(<TerminalHeaderMetadata blockId="b" sessionKey="one" connected={false}/>);
  expect(tag).toHaveAttribute("data-presence", "closing");
  view.rerender(<TerminalHeaderMetadata blockId="b" sessionKey="two" connected={false}/>);
  expect(tag).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});
