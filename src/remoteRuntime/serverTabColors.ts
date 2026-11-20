export const serverTabColors = [
  { name: "雾蓝", value: "#81a9cd" },
  { name: "鼠尾草绿", value: "#8db69b" },
  { name: "淡紫", value: "#ae9aca" },
  { name: "琥珀", value: "#c6a46f" },
  { name: "灰粉", value: "#ca929f" },
  { name: "青瓷", value: "#79b4b7" },
];

type Colored = { tabColor?: string | null };
const validColor = (color: unknown): color is string => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color);

export function nextServerColor(entries: Colored[]): string {
  const counts = new Map(serverTabColors.map(color => [color.value, 0]));
  for (const { tabColor } of entries) {
    if (validColor(tabColor)) {
      const value = tabColor.toLowerCase();
      if (counts.has(value)) counts.set(value, counts.get(value)! + 1);
    }
  }
  return serverTabColors.reduce((best, color) => counts.get(color.value)! < counts.get(best.value)! ? color : best).value;
}

/** Fill older address-book entries without treating an explicit “无色” as missing. */
export function assignServerColors<T extends Colored>(entries: T[]): T[] {
  const assigned: Colored[] = entries.filter(entry => validColor(entry.tabColor));
  return entries.map(entry => {
    if (entry.tabColor === null || validColor(entry.tabColor)) return entry;
    const result = { ...entry, tabColor: nextServerColor(assigned) };
    assigned.push(result);
    return result;
  });
}
