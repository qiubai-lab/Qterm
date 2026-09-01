---
id: QB-20260821-private-key-import-layout
status: archived
archived: 2026-09-02
legacy: true
---
## Background

当前添加私钥页面只提供两个大按钮，本地导入还需进入二级对话框，且不支持原生拖放。

## Requirement

在添加私钥页面固定展示名称与可选口令，并把其余高度按 1:1 分配给拖放/选择文件区与生成私钥入口。

## Non-Goals

不改变凭证领域模型、存储格式、密钥解析或生成算法。

## Architecture Impact

前端只管理名称、口令、拖放状态和不透明草稿摘要；Rust `CredentialState` 暂存候选私钥正文与来源。准备命令返回草稿 ID、来源和安全元数据，提交命令才解析、校验并调用现有 lifecycle 保存。取消或离开页面会清除草稿。

## Domain Model Impact

无。

## API Impact

使用 prepare / commit / cancel 三阶段命令替换直接保存命令；DTO 不返回私钥正文，仅返回不透明草稿 ID、来源、标签和算法元数据。

## Database Impact

无。

## Implementation Tasks

1. 先更新前端 IPC、组件行为与 CSS 契约测试，覆盖点击、拖放及布局。
2. 新增 Rust 拖放路径 DTO/command，复用安全读取与导入路径。
3. 重排 private-key create stage，内联固定表单、拖放区和生成入口，移除本地导入二级对话框。
4. 将直接导入/生成改为 Rust 内存草稿，补 prepare、commit、cancel 命令及严格 DTO。
5. 前端显示草稿摘要、选中高亮与互斥禁用状态，名称保持空白且必填。
6. 在右下角添加取消/保存与固定验证提示，提交成功后才刷新列表。
7. 运行聚焦测试、Rust 格式/测试以及 `pnpm check`。

## Acceptance To Verification

- 固定表单、交互和生成名称复用：`CredentialDialog.test.tsx`。
- IPC 最小暴露：`credentials.test.ts`。
- 1:1 布局与虚线上传面：`appStyles.test.ts`。
- Rust 路径读取仍受既有限制：credential command 测试及 `cargo test`。

## Test Plan

- `pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/lib/tauri/credentials.test.ts src/app/appStyles.test.ts`
- `pnpm check`
- `cargo fmt --check`
- `cargo test --all-targets --all-features`
- 视可用时间运行 `cargo clippy --all-targets --all-features -- -D warnings`。

## Rollback Plan

移除新增 path command/DTO/client 方法，恢复 private-key create stage 的两个选择按钮及原本导入二级对话框。

## Risks

- Tauri 拖放坐标使用物理像素；需按 `devicePixelRatio` 换算并仅在 drop zone 范围内接收。
- 原生拖放事件为 webview 级别；监听器必须随视图卸载并限制为单文件。
- `app.css` 已有用户改动；补丁仅触碰凭证样式选择器。

## Documentation Updates

本 spec 与 plan 足够；无长期项目上下文或 Directory Map 更新。
