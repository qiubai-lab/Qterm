# Workspace 标签内联重命名与 Qterm 品牌实施计划

## Requirement

Plan Level: Standard。重命名涉及 React 结构、样式、测试、Tauri 配置和长期文档，需要多文件一致性验证。

## Scope

实现标签名称区域的原位编辑，保留现有提交与取消语义，并将可见品牌统一为 `Qterm`。不调整 Workspace 模型、持久化或标题栏平台策略。

## Affected Files

- `src/workspace/WorkspaceShell.tsx`
- `src/app/app.css`
- `src/app/App.test.tsx`
- `src-tauri/tauri.conf.json`
- `README.md`
- `docs/qb-spec/context/DECISIONS.md`
- 本 task spec 与 plan

## Design

编辑态继续使用原 `.workspace-tab` 容器，在名称位置渲染 `.workspace-tab-rename`，其内部保留 Workspace 图标并放置透明、无外框的输入框。焦点仅通过名称区域底部细线表达，不改变标签几何尺寸；不增加动画。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 输入框留在原标签内 | App 测试断言编辑前后的 `.workspace-tab` 容器相同。 |
| 图标、关闭按钮和状态稳定 | App 测试断言编辑态 SVG 与关闭按钮仍存在；Windows 截图检查布局。 |
| 重命名语义不回归 | App 测试输入新名称并按 Enter，断言新标签名称。 |
| 品牌统一为 Qterm | App 测试、配置和文档文本检查。 |
| 工程完整性 | `pnpm check`、`pnpm tauri build`、`git diff --check`。 |

## Test / Verification

1. 先更新 App 回归测试并确认旧实现失败。
2. 实现后运行聚焦 App 测试。
3. 运行 `pnpm check`。
4. 因修改 Tauri 窗口配置，运行 `pnpm tauri build`。
5. 启动 Windows release 客户端并截取客户区验证编辑态。
6. 运行 `git diff --check`。

## Documentation Updates

更新 README 与长期决策中的品牌名；Directory Map 无需更新。
