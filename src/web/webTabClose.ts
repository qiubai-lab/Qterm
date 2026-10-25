export const webTabCloseLabels = {
  current: "关闭当前标签", others: "关闭其他标签", left: "关闭左侧标签", right: "关闭右侧标签", all: "关闭全部标签",
};
export type WebTabCloseAction = keyof typeof webTabCloseLabels;

export function webTabCloseTargets(ids: string[], anchor: string, action: WebTabCloseAction) {
  const index = ids.indexOf(anchor);
  if (index < 0) return [];
  return ids.filter((id, position) => action === "all" || (action === "current" ? id === anchor : action === "others" ? id !== anchor : action === "left" ? position < index : position > index));
}

export function closeWebTabBatch<T extends { id: string }>(tabs: T[], selected: string, targets: string[], anchor: string, empty: () => T) {
  const closing = new Set(targets);
  const remaining = tabs.filter(tab => !closing.has(tab.id));
  if (!remaining.length) remaining.push(empty());
  const next = remaining.some(tab => tab.id === selected) ? selected
    : remaining.some(tab => tab.id === anchor) ? anchor
    : remaining[Math.min(Math.max(0, tabs.findIndex(tab => tab.id === selected)), remaining.length - 1)].id;
  return { tabs: remaining, selected: next };
}
