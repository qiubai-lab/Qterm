import { expect, it, vi } from "vitest";
import { createFileDraftWriter } from "./fileDraftWriter";

it("saves a revert made during an older write, and waits for both acknowledgments", async () => {
  let finish!: () => void;
  const write = vi.fn(async (_key: string, _value: unknown) => { void _key; void _value; });
  write.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const writer = createFileDraftWriter(write);
  writer.restore("original");
  const first = writer.save("a", "draft");
  await Promise.resolve();
  const latest = writer.save("a", "original");
  expect(writer.synced("original")).toBe(false);
  finish();
  await Promise.all([first, latest]);
  expect(write.mock.calls).toEqual([["a", "draft"], ["a", "original"]]);
  expect(writer.synced("original")).toBe(true);
});
it("retries an unsaved draft on disconnect without writing it into another pane", async () => {
  const write = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
  const writer = createFileDraftWriter(write);
  await expect(writer.save("file-A", "draft")).rejects.toThrow("offline");
  expect(writer.synced("draft")).toBe(false);
  await writer.save("file-A", "draft");
  expect(write.mock.calls).toEqual([["file-A", "draft"], ["file-A", "draft"]]);
  expect(writer.synced("draft")).toBe(true);
});
