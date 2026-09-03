import { describe, expect, it } from "vitest";

// @ts-expect-error Node built-in types are intentionally absent from the browser production config.
import { readFileSync } from "node:fs";

const dialogStyles = readFileSync("src/components/dialogs/dialogFrame.css", "utf8").replace(/\s+/g, "");
const gitBranchStyles = readFileSync("src/git/styles/gitBranchOverlays.css", "utf8").replace(/\s+/g, "");
const gitHistoryStyles = readFileSync("src/git/styles/gitRepositoryHistory.css", "utf8").replace(/\s+/g, "");
const terminalChromeStyles = readFileSync("src/terminal/terminalChrome.css", "utf8").replace(/\s+/g, "");
const terminalSurfaceStyles = readFileSync("src/terminal/terminalSurface.css", "utf8").replace(/\s+/g, "");

describe("Qterm dialog motion contracts", () => {
  it("animates shared modal entrance, exit, and scrim with reduced-motion fallback", () => {
    expect(dialogStyles).toContain("animation:dialog-in160mscubic-bezier(.2,.8,.2,1)");
    expect(dialogStyles).toContain("@keyframesdialog-in{from{opacity:0;transform:translateY(6px)scale(.985)}");
    expect(dialogStyles).toContain('.dialog-frame[data-state="closing"]{animation:dialog-out130msease-inforwards;pointer-events:none;}');
    expect(dialogStyles).toContain('.dialog-scrim[data-state="closing"]{animation:dialog-scrim-out130msease-inforwards;pointer-events:none;}');
    expect(dialogStyles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(dialogStyles).toContain("animation:none");
  });

  it("keeps every custom production dialog family on an anchored entrance animation", () => {
    expect(gitBranchStyles).toContain("animation:git-repository-popover-in120mscubic-bezier(.2,.8,.2,1)");
    expect(gitHistoryStyles).toContain("animation:git-repository-history-in140mscubic-bezier(.16,1,.3,1)");
    expect(terminalChromeStyles).toContain("animation:terminal-target-menu-in140mscubic-bezier(.16,1,.3,1)");
    expect(terminalChromeStyles).toContain("animation:terminal-target-submenu-in130mscubic-bezier(.16,1,.3,1)");
    expect(terminalSurfaceStyles).toContain("animation:host-summary-in140msease-out");
  });
});
