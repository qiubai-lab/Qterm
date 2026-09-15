import type { ConnectionProfile } from "../lib/tauri/profiles";

export const DEMO_HOME = "/home/demo/qterm";
export const demoProfiles: ConnectionProfile[] = [
  { id: "demo-development", name: "开发服务器", host: "dev.example.test", port: 22, username: "demo", authPreference: "sshAgent", groupId: "demo-servers", jumpProfileIds: [] },
  { id: "demo-staging", name: "预发布服务器", host: "staging.example.test", port: 22, username: "demo", authPreference: "sshAgent", groupId: "demo-servers", jumpProfileIds: [] },
];

export const demoFiles: Readonly<Record<string, string>> = {
  [`${DEMO_HOME}/README.md`]: "# Qterm demo\n\n一个可以自由分屏的远程开发工作台。\n\n这是浏览器中的模拟环境，不执行真实命令。\n试试 npm run build、git status 或 tail -f logs/app.log。\n",
  [`${DEMO_HOME}/package.json`]: '{\n  "name": "demo-workspace",\n  "scripts": { "build": "vite build" }\n}\n',
  [`${DEMO_HOME}/src/main.ts`]: 'console.log("Welcome to Qterm");\n',
  [`${DEMO_HOME}/logs/app.log`]: "[info] Application ready\n[info] Listening on port 3000\n",
};

export function resolveDemoPath(cwd: string, input = DEMO_HOME): string {
  const path = input === "~" ? DEMO_HOME : input.startsWith("~/") ? `${DEMO_HOME}/${input.slice(2)}` : input;
  const parts: string[] = [];
  for (const part of (path.startsWith("/") ? path : `${cwd}/${path}`).split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return `/${parts.join("/")}`;
}

export function isDemoDirectory(path: string): boolean {
  return Object.keys(demoFiles).some(file => file.startsWith(path === "/" ? "/" : `${path}/`));
}

export function listDemoDirectory(path: string): string[] {
  const prefix = path === "/" ? "/" : `${path}/`;
  return [...new Set(Object.keys(demoFiles).filter(file => file.startsWith(prefix)).map(file => {
    const remaining = file.slice(prefix.length);
    return remaining.includes("/") ? `${remaining.split("/")[0]}/` : remaining;
  }))].sort();
}
