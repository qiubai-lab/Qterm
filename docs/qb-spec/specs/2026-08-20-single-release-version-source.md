## Goal

Qterm 发布版本只需在一个受版本控制的源文件中维护，同时保证安装包、Rust 包和发布标签使用同一版本。

## Scope

- 以 `src-tauri/Cargo.toml` 的 `package.version` 作为唯一人工维护的应用版本。
- 让 Tauri 打包配置回退读取 Cargo 包版本。
- 移除私有前端包中未被消费的重复版本声明。
- 标签发布前校验 `vX.Y.Z` 与 Cargo 包版本一致。
- 更新发布文档。

## Constraints

- 保持现有 `v*` 标签触发和三平台构建发布流程。
- `workflow_dispatch` 继续用于任意提交的打包验证，不要求标签。
- `Cargo.lock` 仍由 Cargo 自动维护，不作为人工版本源。

## Non-Goals

- 不引入自动递增版本或自动创建标签。
- 不改变安装包格式、签名、发布说明或 GitHub Release 行为。
- 不调整应用运行时代码。

## Acceptance

1. `package.json` 和 `tauri.conf.json` 不再保存应用版本，`Cargo.toml` 是唯一人工版本源。
2. Tauri 能从 Cargo 包元数据解析出当前版本并完成构建。
3. 标签版本与 Cargo 版本不一致时，发布流水线在桌面构建前失败；一致时通过。
4. 发布文档只要求修改 Cargo 版本，并说明刷新 `Cargo.lock` 和标签一致性要求。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1 | 检查三个配置文件中的版本声明。 |
| 2 | 运行 Cargo 元数据解析、`pnpm check` 和 Tauri 无 bundle 构建。 |
| 3 | 对工作流校验逻辑分别执行匹配与不匹配的聚焦测试，并审查 job 依赖。 |
| 4 | 审查 `docs/release.md` 的发布前检查和命令。 |

## Open Questions

无。

## Recommended Approach

保留 `src-tauri/Cargo.toml` 的 `package.version`，删除 Tauri 配置版本以使用其官方 Cargo 回退机制，并删除私有 `package.json` 中未消费的版本。新增发布前 job 从 Cargo 元数据读取版本并与 Git 标签比较，防止唯一版本源与发布标签脱节。

## Next Skills

- `writing-qb-plans`：使用 Strict 计划覆盖发布配置、流水线保护和验证。
- `protecting-critical-behavior`：保护标签与版本一致性规则。
- `verifying-before-completion`：运行配置、前端和原生构建验证。
- Directory Map：不需要；目录结构和模块职责均未变化。
