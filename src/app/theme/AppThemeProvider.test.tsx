import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setNativeWindowTheme: vi.fn(), refreshTerminalThemes: vi.fn(), getSettings: vi.fn() }));
vi.mock("../../lib/tauri/window", () => ({ setNativeWindowTheme: mocks.setNativeWindowTheme }));
vi.mock("../../terminal/terminalTheme", () => ({ refreshTerminalThemes: mocks.refreshTerminalThemes }));
vi.mock("../../lib/tauri/settings", () => ({ getSettings: mocks.getSettings }));

import { AppThemeProvider, applyAppTheme, bootstrapAppTheme, useAppTheme } from "./AppThemeProvider";

afterEach(() => {
  cleanup();
  document.documentElement.dataset.theme = "dark";
  Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
  vi.clearAllMocks();
});

function ThemeProbe() {
  const { theme, persistedTheme, previewTheme, commitTheme, restoreTheme } = useAppTheme();
  return <div>
    <output aria-label="current">{theme}</output>
    <output aria-label="persisted">{persistedTheme}</output>
    <button onClick={() => previewTheme("light")}>preview</button>
    <button onClick={() => commitTheme(theme)}>commit</button>
    <button onClick={restoreTheme}>restore</button>
  </div>;
}

describe("application theme owner", () => {
  it("applies one preset to the root, native window, and all terminal consumers", () => {
    applyAppTheme("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(mocks.setNativeWindowTheme).toHaveBeenCalledWith("light");
    expect(mocks.refreshTerminalThemes).toHaveBeenCalledOnce();
  });

  it("previews, restores, and commits against the persisted theme", async () => {
    const user = userEvent.setup();
    render(<AppThemeProvider><ThemeProbe/></AppThemeProvider>);
    await user.click(screen.getByRole("button", { name: "preview" }));
    expect(screen.getByLabelText("current")).toHaveTextContent("light");
    expect(screen.getByLabelText("persisted")).toHaveTextContent("dark");
    await user.click(screen.getByRole("button", { name: "restore" }));
    expect(screen.getByLabelText("current")).toHaveTextContent("dark");
    await user.click(screen.getByRole("button", { name: "preview" }));
    await user.click(screen.getByRole("button", { name: "commit" }));
    expect(screen.getByLabelText("persisted")).toHaveTextContent("light");
  });

  it("loads the saved preset before render and falls back to dark on failure", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {} });
    mocks.getSettings.mockResolvedValue({ appearance: { theme: "light" } });
    await expect(bootstrapAppTheme()).resolves.toBe("light");
    mocks.getSettings.mockRejectedValue(new Error("unavailable"));
    await expect(bootstrapAppTheme()).resolves.toBe("dark");
  });
});
