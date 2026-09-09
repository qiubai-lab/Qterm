// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const ordinaryScrollbarFiles = [
  "src/files/fileBrowser.css",
  "src/git/styles/gitShell.css",
  "src/git/styles/gitRepositoryPicker.css",
  "src/git/styles/gitRepositoryHistory.css",
  "src/git/styles/gitOperationOverlay.css",
  "src/git/styles/gitBranchOverlays.css",
  "src/components/dialogs/connectionDialog.css",
  "src/components/dialogs/credentialDialog.css",
  "src/terminal/terminalChrome.css",
];

const ordinaryStyles = ordinaryScrollbarFiles
  .map((path) => readFileSync(path, "utf8"))
  .join("\n")
  .replace(/\s+/g, "");

describe("ordinary overlay scrollbar styles", () => {
  it("does not reserve a gutter or force WebKit scrollbar geometry", () => {
    expect(ordinaryStyles).not.toContain("scrollbar-gutter:stable");

    for (const selector of [
      ".file-browser-content",
      ".file-code-editor.cm-scroller",
      ".file-image-preview",
      ".file-markdown-preview",
      ".file-markdown-table",
      ".git-change-scroll",
      ".git-graph-scroll",
      ".git-branch-list",
      ".git-repository-picker-list-scroll",
      ".git-repository-history-scroll",
      ".git-operation-list",
      ".connection-list",
      ".credential-list",
      ".terminal-target-list",
    ]) {
      expect(ordinaryStyles).not.toContain(`${selector}::-webkit-scrollbar`);
    }
  });

  it("preserves explicit specialized scrollbar implementations", () => {
    const shell = readFileSync("src/app/styles/shell.css", "utf8").replace(/\s+/g, "");
    const terminalChrome = readFileSync("src/terminal/terminalChrome.css", "utf8").replace(/\s+/g, "");
    const terminalSurface = readFileSync("src/terminal/terminalSurface.css", "utf8").replace(/\s+/g, "");
    const changePreview = readFileSync("src/git/styles/gitChangePreview.css", "utf8").replace(/\s+/g, "");

    expect(shell).toContain(".workspace-tab-strip::-webkit-scrollbar{display:none;}");
    expect(terminalChrome).toContain(".terminal-target-submenu-list::-webkit-scrollbar{width:0;height:0;}");
    expect(terminalSurface).toContain(".terminal-surface.xterm-viewport::-webkit-scrollbar{width:3px;}");
    expect(changePreview).toContain(".git-change-comparison.cm-mergeView::-webkit-scrollbar{width:0;height:0");
  });
});
