import { expect, it, vi } from "vitest";
import { openWeb } from "./web";
const ipc = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc }));

it("sends an explicit Local or Remote target and refuses incomplete remote identity", async () => {
  await openWeb("local", null, null, "http://localhost/");
  expect(ipc).toHaveBeenLastCalledWith("web_open", { input: { id: "local", target: { type: "local" }, url: "http://localhost/" } });
  await openWeb("remote", "ssh", "profile", "http://localhost/");
  expect(ipc).toHaveBeenLastCalledWith("web_open", { input: { id: "remote", target: { type: "remote", sessionId: "ssh", profileId: "profile" }, url: "http://localhost/" } });
  await expect(openWeb("bad", null, "profile", "http://localhost/")).rejects.toThrow("SSH");
  await expect(openWeb("bad", "ssh", null, "http://localhost/")).rejects.toThrow("身份");
  expect(ipc).toHaveBeenCalledTimes(2);
});
