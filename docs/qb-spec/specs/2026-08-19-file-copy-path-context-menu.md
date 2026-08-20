## Goal

让用户从文件菜单快速复制文件或文件夹完整路径，并确保菜单在窗口边缘始终贴近触发位置且完整可见。

## Scope

- 文件与文件夹右键菜单新增“复制路径”。
- 使用系统剪贴板写入完整路径，并在状态栏反馈成功或失败。
- 菜单渲染后测量真实尺寸；靠近底部时向上展开，靠近右侧时向左夹紧。
- 鼠标右键与键盘菜单键共用同一定位规则。

## Constraints

- 仅授权剪贴板文本写入，不授权读取。
- 不使用菜单高度硬编码。
- 保持现有紧凑菜单、焦点和 Escape 关闭行为。

## Non-Goals

- 不复制文件内容，不支持多选路径。
- 不调整其他窗口的上下文菜单。

## Acceptance

- 文件和文件夹路径均可写入系统剪贴板。
- 写入完成后菜单关闭，状态栏显示结果。
- 菜单在视口四边保留间距，底部触发时基于实际高度向上展开。
- 新增菜单项后定位无需同步修改固定高度常量。

## Acceptance To Verification

- 组件测试验证文件夹路径写入、状态反馈和菜单关闭。
- 定位测试验证右下角触发时的测量、翻转与夹紧结果。
- `pnpm check` 验证前端完整性；Rust 检查验证插件注册和权限配置。

## Open Questions

无。

## Recommended Approach

使用官方 `@tauri-apps/plugin-clipboard-manager`，仅开放 `allow-write-text`。菜单状态保留触发锚点，`useLayoutEffect` 在绘制前读取菜单实际尺寸并调用纯定位函数计算最终坐标。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
