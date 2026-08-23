# Active Block Radius Alignment

## Goal

选中终端、文件或网络窗口时，高亮边框与窗口外轮廓完全重合，不再在圆角处露出暗色缺口。

## Scope

- 统一工作区内部窗口与移动选中高亮层的圆角来源。
- 为圆角一致性增加样式契约测试。

## Constraints

- 保留现有 9px 窗口圆角、1px 边框、高亮颜色、阴影与移动动画。
- 不改变窗口布局、命中区域、选择逻辑或主题色。
- 不覆盖工作区中无关的未提交修改。

## Non-Goals

- 不重设计内部窗口外观。
- 不调整对话框、按钮或其他控件圆角。
- 不修改高亮移动逻辑。

## Acceptance

- 终端、文件与网络窗口共用的外框圆角和选中高亮圆角来自同一局部变量。
- 高亮层仍与目标窗口使用相同的边界尺寸和位置。
- 现有选中态动画与 reduced-motion 行为保持不变。

## Acceptance To Verification

- 通过 `src/app/appStyles.test.ts` 断言窗口与高亮层消费同一圆角变量。
- 运行聚焦样式测试与 `pnpm check` 验证样式、测试、类型和构建完整性。

## Open Questions

无。

## Recommended Approach

在工作区画布定义局部 `--workspace-block-radius`，由内部窗口和共享高亮层共同消费。相比复制相同像素值，这能从维护边界上消除再次漂移的可能。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Architecture: not needed
- Critical behavior protection: not needed; this is covered by an adjacent style contract
- Project context: not needed
- Directory Map: not needed
