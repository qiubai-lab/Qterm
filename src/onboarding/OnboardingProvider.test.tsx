import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OnboardingProvider } from "./OnboardingProvider";
import { OnboardingRestart } from "./OnboardingRestart";
import { HelpDialog } from "../components/dialogs/InfoDialogs";
import { WorkspaceUtilityRail } from "../workspace/WorkspaceUtilityRail";
import { guideSteps, markOnboardingSeen } from "./onboardingState";

vi.mock("../app/theme/AppThemeProvider", () => ({ useAppTheme: () => ({ theme: "cyberpunk" }) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn().mockResolvedValue("0.1.0") }));
vi.mock("../workspace/WorkspaceProvider", () => ({ useWorkspace: () => ({ hydrated: true }) }));
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });
const tick = (ms = 500) => act(() => { vi.advanceTimersByTime(ms); });
it("introduces tools in rail order and uses the active theme for its portal", () => {
  expect(guideSteps.slice(-3).map(step => step.id)).toEqual(["files", "network", "git"]);
  render(<OnboardingProvider mode="demo"><OnboardingRestart/></OnboardingProvider>); tick();
  expect(screen.getByRole("dialog", { name: "使用引导" })).toHaveAttribute("data-demo-theme", "cyberpunk");
});
function advanceToEnd() {
  fireEvent.click(screen.getByRole("button", { name: "开始引导" }));
  for (let index = 0; index < 6; index++) fireEvent.click(screen.getByRole("button", { name: "下一步" }));
}

it("shows desktop once, records skipping, and allows explicit replay without a version gate", () => {
  const mount = () => render(<OnboardingProvider mode="desktop"><main data-onboarding-ready="true"/><OnboardingRestart/></OnboardingProvider>);
  const first = mount(); tick();
  expect(screen.getByRole("dialog", { name: "使用引导" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "跳过" }));
  first.unmount(); mount(); tick();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "使用引导" }));
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
});

it("starts demo on each fresh mount despite old history, but not after skipping in the same page", () => {
  markOnboardingSeen("demo");
  const mount = () => render(<OnboardingProvider mode="demo"><OnboardingRestart/></OnboardingProvider>);
  const first = mount(); tick();
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "跳过" })); tick(2000);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新引导" }));
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
  first.unmount(); mount(); tick();
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
});

it("waits for other dialogs and pauses when a blocking flow opens", () => {
  const view = render(<OnboardingProvider mode="demo"><div role="dialog">认证</div></OnboardingProvider>);
  tick(); expect(screen.queryByText("欢迎使用 Qterm")).not.toBeInTheDocument();
  view.rerender(<OnboardingProvider mode="demo"><span/></OnboardingProvider>); tick();
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
  view.rerender(<OnboardingProvider mode="demo"><div role="dialog">认证</div></OnboardingProvider>); tick();
  expect(screen.queryByText("欢迎使用 Qterm")).not.toBeInTheDocument();
  view.rerender(<OnboardingProvider mode="demo"><span/></OnboardingProvider>); tick();
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
});

it("completes demo and clears the replay highlight", () => {
  render(<OnboardingProvider mode="demo"><OnboardingRestart/></OnboardingProvider>); tick();
  advanceToEnd();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新引导" })).toHaveClass("onboarding-replay-flash");
  tick(2500);
  expect(screen.getByRole("button", { name: "重新引导" })).not.toHaveClass("onboarding-replay-flash");
});

it("finishes without opening About and allows later replay from its button", async () => {
  function Host() {
    const [open, setOpen] = useState(false);
    return <OnboardingProvider mode="desktop"><main data-onboarding-ready="true"/>
      <WorkspaceUtilityRail controls={{ help: { onClick: () => setOpen(true) } }}/>
      {open && <HelpDialog onClose={() => setOpen(false)}/>}
    </OnboardingProvider>;
  }
  render(<Host/>); tick(); advanceToEnd();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(screen.queryByRole("dialog", { name: "关于 Qterm" })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "关于" })); });
  expect(screen.queryByRole("dialog", { name: "使用引导" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "使用引导" })).toHaveClass("onboarding-replay-flash");
  fireEvent.click(screen.getByRole("button", { name: "使用引导" })); tick();
  expect(screen.queryByRole("dialog", { name: "关于 Qterm" })).not.toBeInTheDocument();
  expect(screen.getByText("欢迎使用 Qterm")).toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "使用引导" })).toHaveFocus();
});

it("waits for desktop readiness and supports Escape without re-prompting", () => {
  const view = render(<OnboardingProvider mode="desktop"><main data-onboarding-ready="false"/></OnboardingProvider>);
  tick(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  view.rerender(<OnboardingProvider mode="desktop"><main data-onboarding-ready="true"/></OnboardingProvider>);
  tick(); expect(screen.getByRole("dialog", { name: "使用引导" })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: "Escape" }); tick();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
