import { expect, it, vi } from "vitest";
import { createSessionStartQueue } from "./sessionStartQueue";

it("keeps a slot free for a newly selected workspace and cancels queued work on lock", async () => {
  const queue = createSessionStartQueue();
  const lease = new AbortController();
  let finish!: () => void;
  const slow = new Promise<void>(resolve => { finish = resolve; });
  const open = vi.fn(() => slow);
  const requests = ["a", "b", "c", "d"].map(id => queue.schedule(id, lease.signal, open));
  expect(open).toHaveBeenCalledTimes(2);
  queue.foreground(["d"], "d");
  expect(open).toHaveBeenCalledTimes(3);
  const cancelled = expect(requests[2]).rejects.toThrow();
  lease.abort();
  await cancelled;
  finish();
  await Promise.all([requests[0], requests[1], requests[3]]);
  expect(open).toHaveBeenCalledTimes(3);
});
