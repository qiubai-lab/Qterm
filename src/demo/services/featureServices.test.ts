import { afterEach, expect, it, vi } from "vitest";
import * as files from "./files";
import * as git from "./git";
import * as network from "./network";
import { closeFeatureSession, resetFeatureSessions } from "../featureSessions";
import { resetDemoProjects } from "../demoProject";
import { DEMO_HOME, demoProfiles } from "../fixtures";
import { launchProxyBrowser } from "./browserProxy";
import { selectUploadFiles } from "./transfers";

const input = { profileId: demoProfiles[0].id, auth: { method: "sshAgent" as const } };
afterEach(() => { resetFeatureSessions(); resetDemoProjects(); network.resetDemoNetwork(); vi.useRealTimers(); });

it("uses one remote project through separate Files and Git connections", async () => {
  const f = await files.connectFileSession(input, vi.fn()); const g = await git.connectGitSession(input, vi.fn());
  const path = `${DEMO_HOME}/src/main.ts`; const original = await files.readTextFile(f, path);
  await files.writeTextFile(f, path, "shared panels\n", original.revision);
  await expect(files.writeTextFile(f, path, "stale\n", original.revision)).rejects.toThrow("重新打开");
  const diff = await git.loadRemoteGitChangeDiff(g, input.profileId, DEMO_HOME, "src/main.ts", false);
  expect(diff.after.content).toBe("shared panels\n");
  await git.executeRemoteGit(g, input.profileId, { type: "stageAll", repository: DEMO_HOME });
  const committed = await git.executeRemoteGit(g, input.profileId, { type: "commit", repository: DEMO_HOME, message: "shared commit" });
  expect(committed.changes).toEqual([]); expect(committed.commits[0].subject).toBe("shared commit");
  expect((await files.readTextFile(null, path)).content).toBe(original.content);
  await expect(git.executeRemoteGit(g, demoProfiles[1].id, { type: "snapshot", path: DEMO_HOME })).rejects.toThrow("不匹配");
  closeFeatureSession(f);
  await expect(files.readTextFile(f, path)).rejects.toThrow("已关闭");
  await expect(files.readTextFile(g, path)).rejects.toThrow("不匹配");
});

it("cancels pending connection events and refuses unsupported native operations", async () => {
  vi.useFakeTimers(); const events = vi.fn();
  const id = await files.connectFileSession(input, events); closeFeatureSession(id);
  vi.runAllTimers(); expect(events).toHaveBeenCalledTimes(1); expect(events).toHaveBeenLastCalledWith({ type: "stateChanged", state: "closed" });
  await expect(selectUploadFiles()).rejects.toThrow("尚未模拟");
  await expect(git.createGitBranch(DEMO_HOME, "feature")).rejects.toThrow("尚未模拟");
  await expect(launchProxyBrowser("rule", "chrome", false)).rejects.toThrow("不会启动");
});

it("isolates network rules and resets their in-memory persistence", async () => {
  const rule = await network.createNetworkRule({ profileId: input.profileId, type: "socks5", name: "Demo SOCKS", bindHost: "127.0.0.1", bindPort: 1080 });
  const id = await network.connectNetworkSession(input, vi.fn());
  await network.startNetworkRule(id, rule.id); await network.stopNetworkRule(id, rule.id);
  expect(await network.listNetworkRules(demoProfiles[1].id)).toEqual([]);
  const other = await network.connectNetworkSession({ ...input, profileId: demoProfiles[1].id }, vi.fn());
  await expect(network.startNetworkRule(other, rule.id)).rejects.toThrow("不匹配");
  network.resetDemoNetwork(); expect(await network.listNetworkRules()).toEqual([]);
});
