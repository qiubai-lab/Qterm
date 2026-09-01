---
id: QB-20260820-network-rule-data-flow
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

将网络规则编辑器顶部静态模式说明替换为可随表单值更新的数据流示意，并为地址字段加入语义一致的设备图标。

## Scope

只调整网络规则编辑界面的展示、图标词汇和邻近测试；不改变规则模型、IPC、校验或执行逻辑。

## Affected Files

- `src/network/NetworkRuleDialog.tsx`
- `src/network/NetworkRuleDialog.test.tsx`
- `src/network/NetworkPane.test.tsx`
- `src/components/Icon.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

- 在编辑器内增加三节点流向：访问端、监听端、目标端。
- 根据 `local`、`remote`、`socks5` 派生监听端和目标端的设备、名称与端点。
- 地址标签复用同一设备映射，防止图示与表单语义不一致。
- 新增与现有线性 SVG 风格一致的浏览器图标，不引入依赖。
- 用两段连续细线替换箭头字符，并以错峰移动的短脉冲表示从左向右的数据方向。
- 在 `prefers-reduced-motion` 下关闭移动，将高亮点固定在连接线目标端。
- 使用内容宽度节点与弹性连接线取代比例列，统一两侧间距；脉冲使用百分比位移适配连接线真实长度。

## Acceptance To Verification

- local / remote / SOCKS5 流向正确：组件测试断言可访问流向说明和节点图标。
- 输入即时反映到示意：组件测试修改地址、端口并断言流向文本。
- 表单行为不变：运行既有 NetworkRuleDialog 与 NetworkPane 测试。
- 紧凑布局与溢出约束：样式契约断言三节点网格、最小宽度和截断规则。
- 连线与方向动效：组件测试断言无箭头且存在两段连接线，样式契约断言脉冲关键帧和减少动效回退。

## Test / Verification

1. 运行网络规则相关 Vitest。
2. 运行 appStyles 样式契约测试。
3. 运行 `pnpm check`。
4. 如本地桌面预览条件可用，检查 remote、local、SOCKS5 与空地址状态。

## Documentation Updates

本 task spec 与 plan 即为本次文档记录；无需更新长期项目上下文或 Directory Map。
