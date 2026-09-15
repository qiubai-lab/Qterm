---
schema: 1
id: QB-20260915-demo-shared-panels
type: bugfix
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Demo 与应用共用功能面板

用户明确采纳共用 Files、Git、Network 面板、仅替换底层服务的方案，并要求落地修改。修正上一变更的 Demo presentation 分叉，保留现有模拟项目数据及目标隔离。

## Requirements

- REQ-001: 两端使用同一 FilesBlock/FileBrowserPane/FilePreviewDocument/CodeEditor，目录与文档视图切换、Markdown 预览、搜索、保存确认和未保存离开保护一致。
- REQ-002: 两端使用同一 GitBlock/GitPane 和 NetworkBlock/NetworkPane；模拟数据通过 typed service adapter 接入，移除三套 Demo 功能页面及其独立 CSS。
- REQ-003: 浏览器服务不触发原生 IPC，虚构连接按用途与目标隔离，关闭或重置清理会话；桌面仍选择原服务。未模拟的原生操作有明确说明，不能报告虚假成功。
- REQ-004: Files 写入、Git 暂存/取消暂存/提交和终端读取共享目标数据；保持修订冲突保护。Network 只模拟规则与运行状态，明确提示无真实隧道。
- REQ-005: 相同内容、主题和视口下功能组件结构一致；Demo 手机视图切换保持可用；回归、构建隔离与组件共用须有自动化保护。

## Behavior Delta

### MODIFIED
- REQ-001: 固定双栏 textarea 改为产品文件浏览及完整文档视图。
- REQ-002: 简化 Git/Network 页面改为产品功能面板。
- REQ-003: 在服务层区分环境，替代整块 UI 分流；未模拟操作返回可理解的限制反馈。
- REQ-004: 模拟项目继续提供文件与仓库状态，通过统一服务契约消费。
- REQ-005: 验收增加相同功能组件和交互流程约束，避免只验证模拟流程可完成。

## Acceptance

- AC-001 [REQ-001, REQ-005]: Demo 打开代码显示 CodeMirror 行号与高亮，打开 Markdown 显示渲染结果；搜索、编辑、覆盖确认、放弃修改使用产品原交互，文件打开后占满面板。
- AC-002 [REQ-002, REQ-004]: Git 展示产品仓库区、更改区、提交图与差异界面；编辑文件后可暂存和提交，终端状态同步。
- AC-003 [REQ-002, REQ-003, REQ-004]: Network 使用产品规则表单和访问窗口，可模拟启停、复制；没有真实监听或代理进程，界面明确说明。
- AC-004 [REQ-003, REQ-004]: 不同目标互不影响；关闭会话后拒绝操作、取消连接不产生晚到事件；过期保存拒绝覆盖；未支持操作明确失败。
- AC-005 [REQ-003, REQ-005]: 两套构建通过且桌面无 Demo 数据；入口无 DemoBlockView 分流，浏览器功能链不调用原生 IPC；桌面回归通过。

## Implementation plan

1. 增加 Files/Git/Network/transfer/platform adapters，沿用 build-selected 服务路径；原生 DTO 保持稳定，DemoProject 拥有模拟业务，feature session registry 拥有虚构非终端会话。
2. 替换功能层直接原生导入，接通共享 Workspace controllers 与 Demo 连接路由；抽出原生拖放订阅，避免 Files 热点增长。
3. 让 LayoutView 两端使用相同 Block，删除 Demo 独立页面/CSS；通过服务错误与必要模拟文案表达能力限制。
4. 添加 shared panel 浏览器构建集成测试、服务隔离/修订/清理测试；手动浏览器验收文件到 Git 闭环与 Network、窄屏；运行 pnpm check、test:demo、build:site、check:site。
5. 更新 Directory Map 与演示说明，记录 AC 证据并归档。

## Architecture and checks

不改变 Rust、IPC DTO 或 workspace schema。LayoutView、FileBrowserPane、GitPane 等 baseline 热点不得增长；抽出的模块必须拥有明确平台或服务责任。共享功能代码不得导入 Demo owner。保持 WorkspaceProvider 唯一 UI runtime owner，模拟项目与连接作为 browser backend。AC-001/002/003 用真实共享组件集成测试和 browser smoke；AC-004 用服务行为测试；AC-005 用构建边界检查、源大小与 pnpm check。

## Verification evidence

- AC-001: `sharedPanels.test.tsx` 直接挂载产品 FileBrowserPane，验证键盘打开 Markdown、真实 Markdown 渲染、搜索、编辑、未保存离开提示与覆盖确认。浏览器实测真实 CodeMirror 行号/高亮及 Ctrl+S 保存，在 1280×720、760×700、390×844 检查布局，深色/浅色/赛博朋克主题均能正常展示。文档视图占满 Block，不再保留独立目录侧栏。
- AC-002: 同一集成测试保存 README 后挂载产品 GitPane，通过原暂存全部及提交主按钮完成提交。浏览器完成 main.ts 编辑、产品 Git 差异对照、暂存、提交、工作区干净，再由终端 cat 读回内容。
- AC-003: 集成测试使用产品 Network 类型选择、规则表单、启动/停止回调、访问窗口与禁用代理浏览器状态；浏览器通过真实 Workspace Network controller 完成虚构连接和规则启动。面板与访问窗口均标明没有真实监听或代理。
- AC-004: `featureServices.test.ts` 覆盖 Files 与 Git 独立会话共享目标、旧修订拒绝、不同目标与不同用途隔离、关闭后拒绝调用、取消待连接事件，以及上传/分支/代理启动的明确拒绝。Network 规则目标隔离与 reset 通过。
- AC-005: 删除 DemoBlockView、DemoFilesBlock、DemoGitBlock、DemoNetworkBlock 及独立 CSS；LayoutView 无 Demo 功能渲染分支。站点全部服务 alias 指向 Demo，未适配服务不再回退到 Tauri。`check-site` 对实际构建产物验证共用面板标记、旧面板缺失与关键原生调用字符串缺失；桌面产物不含演示数据。

最终命令：`pnpm check` 通过（1069 项前端测试，2 项仅 Demo 测试在桌面配置下跳过；脚本测试与桌面构建通过）；`pnpm test:demo` 通过（9 个文件、23 项测试）；`pnpm build:site`、`pnpm check:site`、`pnpm check:source-size` 通过（0 个 ratchet 提醒）。浏览器错误/警告日志为空。

## Remaining simulation limits

完整文件 CRUD/上传下载/二进制读取、Git 历史文件检查/分支/同步/合并/冲突处理仍未模拟，操作返回明确限制。UI 与交互组件共用不代表后端能力等价；真实 SSH/SFTP/网络监听和代理进程仍仅属于桌面。现有限制已同步至 docs/browser-demo.md。没有修改 Rust 或 workspace schema。
