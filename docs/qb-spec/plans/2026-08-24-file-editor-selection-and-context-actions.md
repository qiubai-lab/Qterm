## Background

CodeMirror 的 selection layer 位于内容行下方，当前不透明 active-line 背景会遮挡同一行的文本选择。文件管理器已有基础右键操作，但缺少文件夹打开、语义图标、方向键导航和图片剪贴板动作。

## Requirement

修复编辑器选择可见性，完善主题化文件右键菜单，并支持从图片条目或预览区域复制图片到系统剪贴板。

## Non-Goals

- 不实现剪切、粘贴、移动或原生系统菜单。
- 不开放剪贴板读取权限。
- 不改变文件持久化、删除和传输协议。

## Architecture Impact

新增 `src/lib/tauri/clipboard.ts` 作为图片解码、Tauri Image 资源和 clipboard plugin 的 adapter。`FileBrowserPane` 只决定何时调用并呈现状态，不持有平台资源转换细节。

## Domain Model Impact

无领域模型变化。菜单与预览状态保持在文件 UI 层。

## API Impact

不新增公共 API 或自定义 Tauri command。使用已安装 clipboard-manager 的 `writeImage`，capability 新增单一 `allow-write-image`。

## Database Impact

无。

## Implementation Tasks

1. 先更新样式、菜单和 capability 回归测试，使现状失败。
2. 让 active-line 背景透明混合，并增强 selection 的主题化边缘与对比。
3. 增加图片剪贴板 adapter 及单元测试，确保资源在成功和失败时释放。
4. 完善文件菜单的文件夹打开、图标和键盘导航。
5. 增加图片条目与图片预览右键复制、复制路径和稳定反馈。
6. 运行聚焦与完整验证。

## Acceptance To Verification

- 选择可见性：`appStyles.test.ts`、`themeStyles.test.ts`。
- 菜单能力与交互：`FileBrowserPane.test.tsx`。
- 图片转换和资源生命周期：`clipboard.test.ts`。
- 最小权限：`appStyles.test.ts` 读取 capability 并断言 write-image 存在、read-image 不存在。

## Test Plan

- `pnpm vitest run src/files/FileBrowserPane.test.tsx src/lib/tauri/clipboard.test.ts src/app/appStyles.test.ts src/app/themeStyles.test.ts`
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

移除新增菜单动作与 adapter，撤回 write-image capability，并恢复活动行样式；既有文件读写和文本剪贴板功能不受数据迁移影响。

## Risks

- Canvas 解码受浏览器支持格式限制；范围与现有图片预览格式一致。
- 大图片会产生 RGBA 内存副本；仅在用户显式复制时创建，并立即释放 Tauri resource。
- 剪贴板属于敏感系统能力；严格限制为写图片，不开放读取。

## Documentation Updates

新增本任务 spec 和 plan；无需更新长期 Project Context 或 Directory Map。
