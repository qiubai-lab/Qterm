import { useLayoutEffect, useRef, useState } from "react";

import type { GitRepositoryTreeNode } from "./gitRepositoryContext";

export type GitRepositoryDensity = 0 | 1 | 2 | 3;

// Collapse immediately when necessary; require a small surplus before expanding.
export function chooseGitRepositoryDensity(width: number, required: readonly number[], previous: GitRepositoryDensity): GitRepositoryDensity {
  const candidate = required.findIndex((size, index) => size + (index < previous ? 4 : 0) <= width);
  return (candidate < 0 ? 3 : candidate) as GitRepositoryDensity;
}

const pixels = (value: string) => Number.parseFloat(value) || 0;
const widthOf = (element: Element | null) => element?.getBoundingClientRect().width ?? 0;
const horizontalChrome = (style: CSSStyleDeclaration) => pixels(style.paddingLeft) + pixels(style.paddingRight)
  + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth);

function textWidth(element: Element | null): number {
  if (!element) return 0;
  const range = document.createRange();
  range.selectNodeContents(element);
  return typeof range.getBoundingClientRect === "function" ? range.getBoundingClientRect().width : 0;
}

function measureRow(row: HTMLElement) {
  const select = row.querySelector<HTMLElement>(".git-repository-tree-select");
  const controls = row.querySelector<HTMLElement>(".git-repository-node-controls, .git-repository-tree-actions");
  if (!select) return null;
  const style = getComputedStyle(row);
  const selectStyle = getComputedStyle(select);
  const gap = pixels(selectStyle.columnGap);
  const nameBudget = pixels(style.getPropertyValue("--git-repository-name-budget")) || 104;
  const identity = horizontalChrome(selectStyle) + widthOf(select.querySelector(":scope > svg")) + gap
    + Math.min(nameBudget, textWidth(select.querySelector(".git-repository-name")));
  const state = select.querySelector(".git-repository-tree-state");
  const base = horizontalChrome(style) + widthOf(row.querySelector(".git-repository-tree-leading")) + identity;
  const branch = controls?.querySelector<HTMLElement>(".git-branch-trigger");
  const group = controls?.querySelector<HTMLElement>(".git-repository-status-group");
  const sync = group?.querySelector(".git-repository-sync");
  const branchStyle = branch ? getComputedStyle(branch) : null;
  const branchNatural = branchStyle ? horizontalChrome(branchStyle) + pixels(branchStyle.columnGap)
    + widthOf(branch!.querySelector("svg")) + textWidth(branch!.querySelector("span")) : 0;
  const branchFull = Math.min(branchNatural, pixels(style.getPropertyValue("--git-repository-branch-max")) || 132);
  const branchCompact = Math.min(branchNatural, pixels(style.getPropertyValue("--git-repository-branch-compact")) || 82);
  const changes = group ? horizontalChrome(getComputedStyle(group)) + widthOf(group.querySelector(".git-repository-change-count")) : 0;
  const otherControls = controls ? [...controls.children].filter((child) => child !== branch && child !== group) : [];
  const controlStyle = controls ? getComputedStyle(controls) : null;
  const controlGap = controlStyle ? pixels(controlStyle.columnGap) : 0;
  const fixed = (controlStyle ? horizontalChrome(controlStyle) : 0) + otherControls.reduce((sum, child) => sum + widthOf(child), 0);
  const required = [0, 1, 2, 3].map((level) => {
    const count = otherControls.length + Number(Boolean(branch)) + Number(Boolean(group) && level < 3);
    return base + fixed + Math.max(0, count - 1) * controlGap
      + (level === 0 ? branchFull : branchCompact)
      + (level < 3 ? changes : 0) + (level < 2 ? widthOf(sync ?? null) : 0)
      + (level === 0 && state ? widthOf(state) + gap : 0);
  });
  return { path: row.dataset.repositoryPath!, width: widthOf(row), required };
}

/** Presentation-only sizing; repository selection, snapshots and IPC remain untouched. */
export function useGitRepositoryRowLayout(nodes: readonly GitRepositoryTreeNode[]) {
  const treeRef = useRef<HTMLDivElement>(null);
  const [densities, setDensities] = useState<Record<string, GitRepositoryDensity>>({});

  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    let frame: number | null = null;
    let disposed = false;
    const measure = () => {
      frame = null;
      if (disposed) return;
      const rows = [...tree.querySelectorAll<HTMLElement>(".git-repository-treeitem")];
      // Hidden blocks have no usable geometry; measure again when they become visible.
      const measurements = rows.map(measureRow).filter((row): row is NonNullable<typeof row> => row !== null && row.width > 0);
      if (!measurements.length) return;
      setDensities((previous) => {
        const next = Object.fromEntries(measurements.map(({ path, width, required }) => [path,
          chooseGitRepositoryDensity(width, required, previous[path] ?? 0)]));
        return Object.keys(previous).length === measurements.length && measurements.every(({ path }) => previous[path] === next[path])
          ? previous : next;
      });
    };
    const schedule = () => { if (!disposed && frame === null) frame = window.requestAnimationFrame(measure); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(tree);
    tree.querySelectorAll(".git-repository-treeitem, button, .git-repository-sync, .git-repository-tree-state").forEach((element) => observer?.observe(element));
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    void document.fonts?.ready.then(schedule);
    measure();
    return () => {
      disposed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [nodes]);

  return { treeRef, densities };
}
