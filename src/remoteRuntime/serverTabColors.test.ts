import { expect, it } from "vitest";
import { listServers, saveServers } from "./selection";
import { nextServerColor, serverTabColors } from "./serverTabColors";

it("assigns distinct colors to legacy entries and preserves custom and colorless choices after reload", () => {
  const entry = (id: string) => ({ id, endpoint: "https://" + id + ".test", name: id });
  try {
    saveServers([entry("a"), { ...entry("b"), tabColor: null }, { ...entry("c"), tabColor: "#112233" }, entry("d")]);
    const first = listServers();
    expect(first.map(item => item.tabColor)).toEqual([serverTabColors[0].value, null, "#112233", serverTabColors[1].value]);
    saveServers([...first].reverse());
    expect(listServers().reverse()).toEqual(first);
    expect(nextServerColor(first)).toBe(serverTabColors[2].value);
  } finally { localStorage.removeItem("qterm:runtime-servers"); }
});

it("reuses the least-used preset after all six have been assigned", () => {
  const used = serverTabColors.map(color => ({ tabColor: color.value }));
  expect(nextServerColor([...used, used[0]])).toBe(used[1].tabColor);
});
