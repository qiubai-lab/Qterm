# Qterm Engineering Style

## Maintainable module development

- 非平凡功能迭代必须先确定规则、编排、transport/adapter、presentation 与持久化影响的明确 owner，再向稳定入口接线。
- 稳定入口保持窄 façade；新增独立状态机、parser、mutation family、外部依赖或大块视图时，应优先建立语义化 capability module，而不是继续扩展聚合文件。
- `scripts/check-source-size.mjs` 与 `scripts/source-size-baseline.json` 是源码尺寸限制的可执行事实源。baseline 表示待偿还债务，只允许持平或缩小，不构成继续增长许可。
- 模块拆分必须按职责和变化原因进行，并同步形成可按行为定向运行的相邻测试；禁止用机械切行、万能 `utils/helpers` 或第二份权威状态伪造模块化。
- 前端与 Rust 的依赖方向、稳定入口和禁止内容以 `docs/qb-spec/DIRECTORY_MAP.md` 为准。

后续涉及纵向功能、热点文件增长、状态/adapter 编排或模块边界调整时，使用仓库级 `$qterm-maintainable-modules` skill；其 `SKILL.md` 和 reference 是本规范的执行工作流，不在本文复制易漂移的数值阈值。

