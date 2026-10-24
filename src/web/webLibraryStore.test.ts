import { expect, it, vi } from "vitest";
import { createWebLibraryStore } from "./webLibraryStore";
import type { WebLibrary } from "../lib/tauri/webLibrary";

const empty: WebLibrary = { history: [], bookmarks: [] };
it("shares snapshots by connection and serializes concurrent actions without losing updates", async () => {
  let resolve!: (data: WebLibrary) => void;
  const transport = vi.fn().mockImplementationOnce(() => new Promise<WebLibrary>(done => { resolve = done; })).mockResolvedValue(empty);
  const store = createWebLibraryStore(transport);
  const notified = vi.fn(), unsubscribe = store.subscribe(notified);
  const first = store.execute("a", { kind: "visit", url: "http://localhost/" });
  const second = store.execute("b");
  await Promise.resolve();
  expect(transport).toHaveBeenCalledTimes(1);
  const data = { history: [{ profileId: "a", url: "http://localhost/", title: "localhost", updatedAt: 1 }], bookmarks: [] };
  resolve(data);
  expect(await first).toBe(true);
  expect(await second).toBe(true);
  expect(store.get("a").data).toEqual(data);
  expect(store.get("b").data.history).toEqual([]);
  expect(notified).toHaveBeenCalled();
  unsubscribe();
});

it("preserves the last successful snapshot on save failure and allows retry", async () => {
  const data = { history: [], bookmarks: [{ profileId: "a", url: "https://host/", title: "Saved", updatedAt: 1 }] };
  const transport = vi.fn().mockResolvedValueOnce(data).mockRejectedValueOnce("disk full").mockResolvedValue(empty);
  const store = createWebLibraryStore(transport);
  await store.execute("a");
  expect(await store.execute("a", { kind: "unbookmark", url: "https://host/" })).toBe(false);
  expect(store.get("a").data).toEqual(data);
  expect(store.get("a").error).toBe("disk full");
  expect(store.get("a").busy).toBe(false);
  await store.execute("a");
  expect(store.get("a").error).toBe("");
});
