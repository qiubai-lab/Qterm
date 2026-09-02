---
id: QB-20260902-git-background-refresh-stability
type: bugfix
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 后台刷新稳定性修复

## Background

Git Block 当前会在初次显示、窗口聚焦及每 15 秒轮询时读取完整仓库快照。后台读取被写入全局 `busy`，导致更改操作、主操作按钮和存储库按钮同时进入刷新状态；无论返回内容是否变化，新的 snapshot 对象都会替换现有状态。工作区预览还会因父级重建数组和条目对象而清空详情并重复读取，形成周期性闪烁。

## Goal

让后台 Git 刷新成为不打断当前工作的静默探测：进行中仅存储库刷新图标反馈状态，确认展示数据变化后才更新相关界面，并保持打开的更改预览稳定。

## Scope

- 分离后台刷新与前台 Git 操作状态。
- 合并重复的定时和聚焦刷新请求，并在页面不可见时暂停轮询。
- 对完整 Git snapshot 做稳定的展示等价判断，仅在展示数据变化时应用。
- 稳定工作区预览输入和选择依赖，避免无语义变化导致 diff 重载或清空。
- 后台失败时保留最后一次成功快照。
- 增加前端回归测试。

## Non-Goals

- 不改变本地或 SSH Git IPC、Rust DTO 与命令执行方式。
- 不增加仓库或文件内容指纹接口。
- 不改变手动“获取远程更新并刷新”及其他 Git mutation 的前台 busy 语义。
- 本阶段不承诺识别“文件保持同一 Git 状态但内容再次变化”而不读取 diff；内容指纹属于后续性能增强。

## Requirements

- REQ-001：后台刷新不得禁用暂存、提交、分支等现有操作，也不得替换聚合主操作；进行中只允许存储库刷新图标展示更新状态。
- REQ-002：相同仓库同一时刻最多执行一个后台 snapshot 请求；窗口不可见时不启动轮询，前台操作优先于后台结果。
- REQ-003：后台返回的展示快照与当前快照等价时，必须保留当前 snapshot 引用并避免重建派生界面。
- REQ-004：更改预览不得因父组件无语义重渲染而清空或重新加载；真实选择变化、显式重试仍必须加载。
- REQ-005：后台 snapshot 失败时必须保留最后一次成功内容，并通过现有非阻塞错误反馈暴露失败。
- REQ-006：手动 fetch 和 Git mutation 继续使用现有前台 busy、错误与结果更新行为。

## Behavior Delta

### MODIFIED

- REQ-001：后台刷新由全局阻塞状态改为仅刷新图标可见的静默状态。
- REQ-002：聚焦与定时触发由可重叠请求改为单飞且遵守页面可见性。
- REQ-003：相同展示快照不再替换当前状态。
- REQ-004：预览由对象引用驱动重载改为稳定语义键驱动。
- REQ-005：后台刷新失败由清空 Git Block 改为保留最后成功快照。

## Acceptance Criteria

- AC-001（REQ-001、REQ-006）：未完成的后台 snapshot 只使存储库刷新按钮进入更新状态；暂存按钮和聚合主操作保持可用、文案与 DOM 身份稳定，手动 fetch 仍显示前台忙碌状态。
- AC-002（REQ-002）：后台 snapshot 未完成时，新的 interval、focus 或 visibility 触发不会再启动第二个请求；隐藏页面不执行周期轮询。
- AC-003（REQ-003）：返回结构相同的新 snapshot 对象后，Git 更改列表与预览输入保持语义稳定；返回不同快照后界面正常更新。
- AC-004（REQ-004）：以新数组或新条目对象重渲染相同预览文件不会再次调用 loader，也不会清空已渲染 diff；切换文件和重试仍会调用 loader。
- AC-005（REQ-005）：后台失败后仓库名称和更改列表仍存在，并显示非阻塞错误反馈。
- AC-006（REQ-002、REQ-006）：前台操作开始后，先前后台请求的迟到结果不得覆盖前台操作结果。

## Assumptions And Risks

- `GitSnapshot` 的数组排序由现有 Git 命令保持稳定，可进行字段级深比较；该比较只代表展示等价，不代表工作区文件内容绝对未变。
- 浏览器端无法取消已发送的 Tauri/SSH 请求，因此通过单飞和 epoch 让迟到结果失效，而不是中止底层命令。

## Quality Check

目标、范围、非目标和错误恢复路径明确；六项 requirement 均有 acceptance 覆盖。未发现需要独立严格审查的安全、schema、公共 API 或核心领域变更。

## Verification Summary

- AC-001：后台 deferred snapshot 测试确认只有仓库刷新按钮进入 `aria-busy`/旋转状态，暂存与聚合主操作保持可用且 DOM 身份稳定；手动 fetch 和 Push 测试继续保护前台 busy 语义。
- AC-002：interval、focus 与 visibility 测试确认后台请求单飞，隐藏页面不读取，恢复可见后立即读取。
- AC-003：纯函数测试覆盖 head、changes、branches、remotes、commits 与 merge state；GitPane 测试确认等价快照不扰动界面、差异快照会更新仓库展示。
- AC-004：GitChangePreview 单元测试和 GitPane 集成测试确认克隆条目与等价 snapshot 不会再次调用 diff loader 或清空现有详情。
- AC-005：后台失败测试确认最后成功的仓库名称与更改列表保留，并显示现有非阻塞错误反馈。
- AC-006：竞态测试确认后台请求期间允许前台暂存，后台迟到结果不会覆盖 mutation 结果；跨 target 迟到结果同样失效。
- `pnpm vitest run src/git`：17 个测试文件、159 个测试通过。
- `pnpm check`：ESLint、80 个测试文件共 727 个测试、9 个 Tauri wrapper 脚本测试、TypeScript 和 Vite 生产构建全部通过。构建仅保留既有的大 chunk 提示。

## Residual Risk

- 展示快照等价不等同于工作区内容指纹；已处于相同 Git 状态的文件继续变化时，当前打开的预览不会仅凭 snapshot 自动重载。若后续需要严格避免或精确触发内容级读取，应增加本地与 SSH 共用的文件内容指纹协议。
