---
schema: 1
id: QB-20260915-browser-demo-workflow
type: feature
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Browser demo cross-panel workflow

## Authorization and scope

用户要求将上一轮评估的浏览器模拟方案落地为 spec、plan 并完成修改。保持静态站点和虚构环境，不连接真实服务器、不执行本机 Shell、不建立真实隧道，也不收集密码或私钥。优先补齐终端 → Files → Git 的可操作闭环；Network 和连接入口提供清楚标注的模拟体验。桌面 Tauri 行为、IPC DTO 和持久化 schema 不变。

## Requirements

- REQ-001: 本地、开发服务器和预发布服务器的演示项目状态相互隔离；同一目标下的终端、Files、Git 读取同一文件与仓库状态。重置和刷新恢复预置状态。
- REQ-002: 用户可从终端当前目录打开 Files Block，浏览演示目录、预览并修改文本文件；保存采用修订号，过期保存给出明确失败反馈，不覆盖较新内容。
- REQ-003: Git Block 展示由演示文件产生的状态和差异，并支持暂存、取消暂存、提交；终端 `git status` 与 Git Block 同步。空提交或无效操作给出反馈。
- REQ-004: 浏览器构建只调用演示服务；桌面构建保留原服务和既有行为。Files、Git、Network 入口不因被开放而落到原生 IPC，不伪造 Tauri host。
- REQ-005: Network Block 可配置、启停虚构规则并显示运行状态；界面明确告知没有建立真实端口转发或代理，不能启动桌面浏览器代理。
- REQ-006: 连接入口仅使用虚构目标和非敏感演示配置，不收集真实认证材料；目标切换后已有 Block 的生命周期和数据隔离保持明确。
- REQ-007: 在正常、失败、空、忙碌及窄视口状态下，核心操作可由鼠标和键盘发现并使用；关闭或重置清理模拟任务，桌面 UI 与现有 Demo 终端行为不退化。

## Behavior Delta

### ADDED

- REQ-001: 演示终端、文件和 Git 从共享的目标项目状态产生一致结果。
- REQ-002: 演示 Files Block 可浏览、预览和保存虚构文件。
- REQ-003: 演示 Git Block 可审阅、暂存和提交虚构更改。
- REQ-005: 演示 Network Block 可展示虚构规则配置和运行状态。
- REQ-006: 演示连接入口展示虚构目标的配置与选择语义。

### MODIFIED

- REQ-004: Files、Git、Network 的原禁用入口改为经演示服务保护的模拟入口；桌面入口不变。
- REQ-007: 演示从单终端体验扩展为跨 Block 体验，仍在重置后回到初始场景。

## Acceptance

- AC-001 [REQ-001, REQ-002, REQ-003]: 编辑 `src/main.ts` 并保存后，同目标终端 `cat` 读到新内容，`git status` 显示修改，Git Block 可查看差异；暂存并提交后状态变干净。
- AC-002 [REQ-001, REQ-006]: 在开发服务器修改文件不会改变本地和预发布服务器的文件或 Git 状态；同目标两个终端可观察同一更改，切换目标不会复用旧目标会话。
- AC-003 [REQ-002, REQ-003]: 两个编辑者使用同一旧修订号时第二次保存失败；空提交、无效路径或已过期 Git 操作不得改变状态，并显示可理解的反馈。
- AC-004 [REQ-004]: demo/site 产物不含可执行原生 IPC 路径；桌面构建与现有前端回归通过，Demo 不创建 `__TAURI_INTERNALS__`。
- AC-005 [REQ-005]: 用户可创建并启停虚构网络规则；复制地址可用浏览器剪贴板，界面没有“真实隧道已建立”的误导性反馈，浏览器代理启动不可用。
- AC-006 [REQ-006, REQ-007]: 仅虚构连接可选择；演示不提供真实密码/私钥输入。关闭、重置、刷新清理会话与任务；搜索、分屏、主题和窄视口仍可用。

## Design choice and risks

采用共享内存项目状态与 build-selected 浏览器 adapters，复用现有 Workspace 布局和可拆出的 feature 展示部件。原 Files/Git/Network 的直接原生服务和插件导入是主要边界风险，需逐一迁到窄服务入口或在 Demo 专用 presentation 隔离。Git 完整分支、同步、合并与冲突以及真实 SSH/PTY/SFTP/TCP 不进入本 change；这些能力若要真实运行需独立 Web 后端工程。

## Verification evidence

- AC-001: 浏览器手动操作完成终端打开文件夹、编辑保存 `src/main.ts`、查看 Git 差异、暂存、提交、再由终端 `cat src/main.ts` 读取提交后的内容；`demoProject.test.ts` 和 `demoBlocks.test.tsx` 覆盖跨面板状态与干净仓库。
- AC-002: `demoProject.test.ts` 验证开发目标更改不影响预发布目标；`terminalSession.test.ts` 验证同目标两个终端共享 Files 修改且第三个目标隔离。浏览器直接打开 `?scene=remote` 并切换开发／预发布虚构目标。
- AC-003: 状态测试覆盖旧修订保存、空提交、无效路径、重复暂存／取消暂存及过期暂存和提交拒绝；编辑和 Git 界面将规则错误反馈给用户。
- AC-004: Demo 非终端 Block 仅经 `DemoBlockView` 使用 `DemoProject` 与组件内模拟规则；`pnpm check` 全量通过（170 个前端测试文件、1067 个测试及 17 个脚本测试），桌面与站点构建通过，`pnpm check:site` 验证站点链接和资产隔离。
- AC-005: 浏览器手动新建并启动虚构 Network 规则；`demoBlocks.test.tsx` 覆盖“没有建立真实隧道或代理”文案、启停状态，以及复制虚构地址的成功与失败反馈。
- AC-006: 浏览器在 1280、760、390 宽度检查分屏和手机“视图”切换，并验证 remote 场景、Files 操作与 Network 操作；`demoProject.test.ts` 验证 reset 清理目标数据，演示构建不提供真实凭据表单。浏览器错误／警告日志为空。

最终检查：`pnpm test:demo`、`pnpm check:source-size`（0 个 ratchet 提醒）、`git diff --check`、`pnpm build`、`pnpm build:site` 和 `pnpm check:site` 均通过。完整文件上传下载、Git 分支／同步／合并／冲突以及真实 Shell、SSH、SFTP、网络隧道仍由 `docs/browser-demo.md` 列为演示限制。
