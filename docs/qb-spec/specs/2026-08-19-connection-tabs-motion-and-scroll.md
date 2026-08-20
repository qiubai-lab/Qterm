# 连接配置 Tab 动效与滚动边界 Task Spec

Status: Complete (2026-08-19)。Tab 分段承载面、方向切换动效、减少动态效果和单一表格滚动边界均已实现并验证。

## Goal

让连接配置的 Tab 更有层次和方向感，并确保扫描私钥后只有私钥表格在内容超量时滚动，认证页面本身不产生意外滚动条。

## Scope

- 将当前平铺底线式 Tab 重设计为紧凑的分段承载面。
- 选中指示器在两个标签之间连续滑动，标签文字同步改变强调状态。
- Tab 内容按切换方向进行短距离滑入和淡入，并支持快速连续切换。
- 为减少动态效果偏好提供无位移的短淡入反馈。
- 重构编辑内容区高度分配，使私钥结果表格占用剩余空间并独立滚动。

## Constraints

- 不引入新的动画依赖；仅动画化 `transform` 与 `opacity`。
- 切换状态立即生效，不等待动画结束，不锁定用户输入。
- 弹窗、底部操作区及左侧连接列表尺寸不变。
- 私钥结果仍保留语义表格和固定表头。

## Non-Goals

- 不修改连接配置字段、保存逻辑、扫描逻辑或私钥选择行为。
- 不加入拖拽或手势切换。
- 不调整全局 Tab 组件或其他弹窗。

## Acceptance

1. Tab 具有独立容器、连续滑动的选中承载面及清晰但克制的标签强调。
2. 从连接信息切到认证方式时内容轻微向左进入，反向切换时路径对称。
3. 用户快速来回切换时不会被动画锁定，最终内容与选中标签一致。
4. `prefers-reduced-motion: reduce` 下移除滑动位移，仅保留短淡入或静态反馈。
5. 私钥结果出现后，编辑内容外层保持 `overflow:hidden`；表格使用剩余高度，并仅在行数超量时内部滚动。

## Acceptance To Verification

- 1、2、4、5：样式回归测试检查滑块、内容方向动画、减少动态效果和滚动边界声明。
- 3：组件测试快速点击两个 Tab，验证最终选中状态和内容一致。
- 5：组件测试验证扫描结果仍为语义表格；运行完整前端质量闸口。

## Open Questions

无。

## Recommended Approach

可选方案一是保留两个按钮分别切换背景色，成本低但快速切换时缺少连续空间关系；方案二是在分段容器内保留一个持久滑块，并让新内容依据方向从相邻位置进入。推荐方案二，因为它既能表达“同一层级中的相邻页面”，又能由 CSS transition 从当前视觉位置重新定向，快速点击时不跳变。

## Next Skills

- `apple-design-skills:apple-design`
- `writing-qb-plans`（Standard）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed（局部视觉与滚动修复）
- Directory Map: not needed（无结构变化）
