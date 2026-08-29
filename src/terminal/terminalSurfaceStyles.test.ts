import { describe, expect, it } from "vitest";

import { readCssBundle } from "../test/css";

const styles = readCssBundle("src/app/app.css");

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches[matches.length - 1]?.[1] ?? "";
}

function declarationsContaining(selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...styles.matchAll(new RegExp(`(?:^|}|,)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))];
  return matches.find((match) => match[1]?.includes(property))?.[1] ?? "";
}

describe("terminal search surface styles", () => {
  it("keeps the native search input optically centered without global form chrome", () => {
    const input = declarations(".terminal-search input");
    const focus = declarations(".terminal-search input:focus-visible");

    expect(input).toContain("height:24px");
    expect(input).toContain("margin:0");
    expect(input).toContain("line-height:24px");
    expect(input).toContain("box-shadow:none");
    expect(input).toContain("appearance:none");
    expect(focus).toContain("box-shadow:none");
  });

  it("animates both mounting directions and removes spatial motion when requested", () => {
    expect(styles).toContain('.terminal-search[data-state="open"]');
    expect(styles).toContain('animation:terminal-search-in 140ms');
    expect(styles).toContain('.terminal-search[data-state="closing"]');
    expect(styles).toContain('animation:terminal-search-out 110ms');
    expect(styles).toContain('@keyframes terminal-search-out');
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*terminal-search-fade-in/);
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*terminal-search-fade-out/);
  });
});

describe("terminal staging status styles", () => {
  it("anchors a themed transient card at the terminal bottom-right without taking layout space", () => {
    const status = declarationsContaining(".terminal-staging-status", "position:absolute");
    const copy = declarationsContaining(".terminal-staging-status-copy", "display:grid");
    const icon = declarations(".terminal-staging-status-icon");
    const progressRow = declarations(".terminal-staging-progress-row");
    const progress = declarationsContaining(".terminal-staging-progress", "color:var(--terminal-staging-indicator-tone)");
    const metrics = declarationsContaining(".terminal-staging-metrics", "color:var(--muted)");
    const stop = declarationsContaining(".terminal-staging-stop", "width:28px");
    const stopActive = declarationsContaining(".terminal-staging-stop:active:not(:disabled)", "transform:scale(.94)");
    const stopFocus = declarations(".terminal-staging-stop:focus-visible");
    const error = declarations('.terminal-staging-status[data-phase="failed"] .terminal-staging-status-copy strong');

    expect(status).toContain("position:absolute");
    expect(status).toContain("right:10px");
    expect(status).toContain("bottom:10px");
    expect(status).toContain("width:min(240px,calc(100% - 20px))");
    expect(status).toContain("height:56px");
    expect(status).toContain("grid-template-columns:28px minmax(0,1fr) 28px");
    expect(status).toContain("grid-template-rows:28px 10px");
    expect(status).toContain("padding:7px 8px");
    expect(status).toContain("--terminal-staging-status-tone:var(--primary-action)");
    expect(status).toContain("--terminal-staging-indicator-tone:var(--accent)");
    expect(status).toContain("border:1px solid var(--floating-border)");
    expect(status).toContain("background:var(--floating-material)");
    expect(status).toContain("box-shadow:0 12px 30px var(--shadow-strong)");
    expect(status).toContain("transform-origin:bottom right");
    expect(copy).toContain("display:grid");
    expect(copy).toContain("grid-template-rows:12px 12px");
    expect(copy).toContain("grid-column:2");
    expect(copy).toContain("grid-row:1");
    expect(copy).toContain("height:28px");
    expect(icon).toContain("width:28px");
    expect(icon).toContain("height:28px");
    expect(icon).toContain("grid-column:1");
    expect(icon).toContain("grid-row:1");
    expect(icon).toContain("border:1px solid");
    expect(icon).toContain("color:var(--terminal-staging-indicator-tone)");
    expect(styles).toContain(".terminal-staging-status-copy strong,.terminal-staging-status-copy small{display:block;overflow:hidden;line-height:12px");
    expect(progressRow).toContain("display:grid");
    expect(progressRow).toContain("grid-column:1/4");
    expect(progressRow).toContain("grid-row:2");
    expect(progressRow).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(progressRow).toContain("gap:7px");
    expect(progress).toContain("width:100%");
    expect(progress).toContain("color:var(--terminal-staging-indicator-tone)");
    expect(metrics).toContain("color:var(--muted)");
    expect(stop).toContain("width:28px");
    expect(stop).toContain("height:28px");
    expect(stop).toContain("grid-column:3");
    expect(stop).toContain("grid-row:1");
    expect(stop).toContain("border:1px solid var(--border)");
    expect(stop).toContain("background:var(--control-bg)");
    expect(stopActive).toContain("transform:scale(.94)");
    expect(stopFocus).toContain("outline:2px solid var(--focus)");
    expect(error).toContain("color:var(--danger)");
    expect(styles).toContain('--terminal-staging-status-tone:var(--danger)');
    expect(styles).toContain('--terminal-staging-indicator-tone:var(--danger)');
    expect(styles).toContain('--primary-action:#fcee0a');
    expect(styles).toContain('--accent:#00ddeb');
    expect(styles).toContain('.terminal-staging-status[data-state="closing"]');
    expect(styles).toContain('.terminal-staging-status[data-operation="local"] .terminal-staging-stop,.terminal-staging-status[data-operation="local"] .terminal-staging-progress-row{visibility:hidden}');
    expect(styles).toContain("to{opacity:0;transform:translateY(4px) scale(.985)}");
    expect(styles).not.toMatch(/max-width:300px[\s\S]*?terminal-staging-status-copy small[^}]*display:none/);
    expect(styles).toMatch(/max-width:300px[\s\S]*?\.terminal-staging-metrics\{display:none\}/);
    expect(styles).toMatch(/prefers-reduced-motion:reduce[\s\S]*\.terminal-staging-status\{animation:none\}/);
  });
});
