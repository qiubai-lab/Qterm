import { expect, it } from "vitest";
import { closeWebTabBatch, webTabCloseTargets } from "./webTabClose";

const ids = ["a", "b", "c", "d"];
const tabs = ids.map(id => ({ id }));
it("computes close ranges relative to the clicked tab, never a missing anchor", () => {
  expect(webTabCloseTargets(ids, "b", "current")).toEqual(["b"]);
  expect(webTabCloseTargets(ids, "b", "others")).toEqual(["a", "c", "d"]);
  expect(webTabCloseTargets(ids, "b", "left")).toEqual(["a"]);
  expect(webTabCloseTargets(ids, "b", "right")).toEqual(["c", "d"]);
  expect(webTabCloseTargets(ids, "b", "all")).toEqual(ids);
  expect(webTabCloseTargets(ids, "missing", "all")).toEqual([]);
  expect(webTabCloseTargets(ids, "a", "left")).toEqual([]);
  expect(webTabCloseTargets(ids, "d", "right")).toEqual([]);
});
it("keeps surviving active pages, falls back to the anchor or neighbor, and retains an empty last page", () => {
  const empty = () => ({ id: "empty" });
  expect(closeWebTabBatch(tabs, "d", ["a"], "b", empty).selected).toBe("d");
  expect(closeWebTabBatch(tabs, "d", ["c", "d"], "b", empty).selected).toBe("b");
  expect(closeWebTabBatch(tabs, "b", ["b"], "b", empty).selected).toBe("c");
  expect(closeWebTabBatch(tabs, "d", ["d"], "d", empty).selected).toBe("c");
  expect(closeWebTabBatch(tabs, "b", ids, "b", empty)).toEqual({ tabs: [{ id: "empty" }], selected: "empty" });
});
