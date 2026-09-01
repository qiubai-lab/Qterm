---
id: QB-20260901-git-picker-directory-metadata
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Plan

## Requirement

实现 `QB-20260901-git-picker-directory-metadata` 的 REQ-001 至 REQ-005。

## Scope

只扩展 Git 目录 DTO 投影和 picker 列表呈现；复用既有文件元数据与格式化规则。

## Affected Files

- `src-tauri/src/commands/git.rs`
- `src/lib/tauri/git.ts`
- `src/git/GitRepositoryPickerDialog.tsx`
- `src/git/GitRepositoryPickerDialog.test.tsx`
- `src/git/styles/gitRepositoryPicker.css`
- `src/git/gitStyles.test.ts`

## Design

- Command DTO 从 `FileEntry` 透传两个 nullable 元数据字段，不修改 domain/application/infrastructure。
- UI 复用 `formatPermissions`，并按文件管理 Block 的列层级与 icon token 建立三列目录行。
- 弹窗宽度从 620px 调整到适合三列信息的 740px，保留 48px viewport gutter。

## Implementation Tasks

- [x] 扩展 Rust/TypeScript Git directory DTO 并添加投影测试。
- [x] 增加 picker 列头、权限与修改时间内容及缺失值格式。
- [x] 调整宽度、列布局、文件夹图标状态色和窄视口规则。
- [x] 更新组件与样式契约测试。

## Acceptance To Verification

- AC-003：`cargo test commands::git::tests --lib`。
- AC-001、AC-002、AC-004、AC-005：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts`。
- AC-001 至 AC-005：`pnpm check`，并运行相关 Rust fmt/clippy/test 检查。

## Test / Verification

按 DTO 单测、picker 聚焦测试、前端检查、相关 Rust 检查的顺序执行。

## Documentation Updates

字段仍属于现有 Git-purpose 只读目录浏览 DTO，不改变模块职责或目录结构，无需更新 Directory Map。
