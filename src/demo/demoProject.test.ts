import { afterEach, expect, it } from "vitest";
import { DEMO_HOME } from "./fixtures";
import { getDemoProject, resetDemoProjects } from "./demoProject";
import { runDemoCommand } from "./shellCommands";

const source = `${DEMO_HOME}/src/main.ts`;
afterEach(resetDemoProjects);

it("shares file and Git state across commands and isolates targets", () => {
  const dev = getDemoProject("demo-development");
  const other = getDemoProject("demo-staging");
  const original = dev.read(source);
  dev.write(source, 'console.log("Changed");\n', original.revision);
  expect(runDemoCommand("cat src/main.ts", DEMO_HOME, dev).output).toContain("Changed");
  expect(runDemoCommand("git status", DEMO_HOME, dev).output).toContain("src/main.ts");
  expect(other.read(source).content).toBe(original.content);
  dev.stage([source]);
  expect(dev.changes()[0]).toMatchObject({ staged: true, unstaged: false });
  dev.commit("demo change");
  expect(dev.changes()).toEqual([]);
  expect(runDemoCommand("git log", DEMO_HOME, dev).output).toContain("demo change");
});

it("rejects stale saves and empty commits without changing state", () => {
  const project = getDemoProject(null);
  const original = project.read(source);
  project.write(source, "updated\n", original.revision);
  expect(() => project.write(source, "stale\n", original.revision)).toThrow("重新打开");
  expect(project.read(source).content).toBe("updated\n");
  expect(() => project.commit("nothing staged")).toThrow("没有可提交");
  expect(() => project.stage([`${DEMO_HOME}/missing.ts`])).toThrow("没有该演示文件");
  expect(() => project.stage([source], 0)).toThrow("仓库状态已变化");
  expect(() => project.unstage([source])).toThrow("尚未暂存");
  project.stage([source]);
  expect(() => project.stage([source])).toThrow("没有可暂存");
  const stagedVersion = project.getVersion();
  project.write(source, "newer\n", project.read(source).revision);
  expect(() => project.commit("stale commit", stagedVersion)).toThrow("仓库状态已变化");
});

it("resets files, Git state and targets together", () => {
  const project = getDemoProject(null);
  project.write(source, "new\n", project.read(source).revision);
  resetDemoProjects();
  expect(getDemoProject(null).read(source).content).not.toBe("new\n");
});
