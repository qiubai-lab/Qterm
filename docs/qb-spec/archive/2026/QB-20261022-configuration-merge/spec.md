---
schema: 1
id: QB-20261022-configuration-merge
type: feature
tier: standard
status: archived
created: 2026-10-22
updated: 2026-10-22
supersedes: []
---

# 合并其他 Qterm 配置

仅合并连接与分组、网络规则和凭证；不修改设备设置、Workspace、主机信任、缓存或目录指针。

## Behavior Delta
### ADDED
- REQ-001：目录标题中在重启标签后提供合并按钮；目录草稿或待重启状态禁止合并。两步弹窗选择来源并预览类别、结果与错误。
- REQ-002：连接与分组整体导入，网络依赖连接；保留当前内容，重复跳过，冲突重命名，完整映射所有引用。
- REQ-003：凭证可独立选择，在 Rust 内解密并按当前库密钥重新加密；未选择时清空导入连接凭证引用。复用当前初始化流程。
- REQ-004：限定读取清单与大小，校验路径、格式与依赖；提交校验快照，串行写入、备份、失败回滚和启动恢复；来源只读。
- REQ-005：提交后刷新连接数据，不连接服务器、不启动转发、不打断已有会话。

## Acceptance
- AC-001（REQ-001）：选择取消、扫描错误、返回、类别切换、空结果、解锁与结果反馈均可操作，固定反馈区与滚动区。
- AC-002（REQ-002）：重复导入不增长，ID 冲突不覆盖，跳板与网络映射正确，缺失引用拒绝。
- AC-003（REQ-003）：不同主密码可合并，错误密码零写入；秘密不进入预览；跳过凭证提示解绑。
- AC-004（REQ-004）：同目录、越界路径、损坏类别、变化快照被拒绝；多文件失败与重启恢复受测试保护。
- AC-005（REQ-005）：即时刷新但不创建运行时连接。

## Implementation
- Domain/application：合并输入、去重/命名/依赖映射与预览规则；通过合并存储 port 编排。
- Infrastructure：受限扫描、暂存仓库、共享存储事务锁、带备份的提交与恢复。
- Commands：原生目录选择、输入 DTO、状态注入；不接受前端提交实体或目标路径。
- Frontend：独立 configurationMerge controller/dialog、typed IPC；Settings 只组合入口。
- 新模块保持源码限制内；基线仓库先抽出相邻测试，避免扩张热点。
- 验证：相邻 Rust 与 React 行为测试、source-size、pnpm check、Rust fmt/clippy/test。

## Quality / invariants
当前数据不覆盖、现有 schema 不变、当前 vault identity/key 不变。类别错误可取消该类别；网络依赖失效不得降级静默提交。运行时只读取已经完整提交的数据。

## Verification
- AC-001 / AC-005：Settings 与合并弹窗 18 项聚焦测试通过，涵盖入口禁用、目录取消、类别依赖、初始化入口、过期预览、提交后刷新事件与固定布局。使用独立示例数据页面做浏览器截图检查；未操作用户真实配置。
- AC-002 / AC-003 / AC-004：合并 planner/storage 的 11 项 Rust 测试通过，覆盖引用重映射、重复导入、密码错误零写入、不同主密码重加密、私钥材料去重、来源/目标变化、目标锁定、写入失败回滚和启动恢复。Unix 符号链接测试保留供 Unix CI 执行。
- 前端 `pnpm check` 通过：1200 项 Vitest 测试通过、2 项跳过；脚本测试 17 项通过、2 项因 Bash 不可用跳过；生产构建通过。后续新增布局与入口断言的 18 项聚焦测试通过。
- Rust `cargo test --all-targets --all-features --quiet`：330 项通过，6 项忽略；随后新增私钥去重断言的 11 项合并聚焦测试通过。
- `cargo clippy --all-targets --all-features -- -D warnings`、`cargo fmt --check`、source-size 检查通过。抽离凭证加密辅助函数与仓库测试，移除两项既有源码尺寸 baseline。
- 浏览器检查修正全局 input 样式对复选框的影响，以及固定 footer 与内容滚动；截图保存于本次任务可视化目录。

## Implementation notes
- 保持现有跳板机约束：来源跳板使用密码/私钥凭证时，必须同时选择凭证；否则明确提示，不静默移除跳板路径。
- 合并备份位于当前 data 目录的 `.merge-backup-*.json`；恢复日志为 `.merge-pending.json`，只包含原始配置与加密 vault 字节。运行中进程内存储操作串行；对不遵守协议的外部程序写入不提供跨进程事务保证。
- 原生目录选择复用异步 callback bridge；未进行 macOS 原生面板人工复验。
