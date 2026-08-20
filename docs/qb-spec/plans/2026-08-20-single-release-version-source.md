## Background

当前发布需要手工同步 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json`，存在遗漏和标签版本不一致的风险。

## Requirement

将应用版本收敛到 `src-tauri/Cargo.toml`，并在标签触发的发布流程中自动验证标签版本。

## Non-Goals

- 不自动修改版本、提交或创建标签。
- 不改变构建矩阵、安装包目标或 Release 发布 action。

## Architecture Impact

仅调整构建配置和发布流水线；不影响前后端模块边界或运行时架构。

## Domain Model Impact

无。

## API Impact

无。

## Database Impact

无。

## Implementation Tasks

1. 删除 `package.json` 和 `src-tauri/tauri.conf.json` 的重复版本字段。
2. 在 `.github/workflows/build-desktop.yml` 增加前置版本校验 job，并让构建 job 依赖它。
3. 更新 `docs/release.md`，将 Cargo 包版本记录为唯一维护点。
4. 执行聚焦验证、完整前端检查和 Tauri 原生构建检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 单一人工版本源 | `rg` 检查三个配置文件；Cargo 元数据确认版本。 |
| Tauri 使用 Cargo 版本 | `pnpm tauri build --no-bundle`。 |
| 标签不一致被阻止 | 本地执行工作流中的匹配与不匹配 shell 逻辑；检查 `build.needs`。 |
| 文档同步 | 检查发布步骤只要求修改 `Cargo.toml`。 |

## Test Plan

- `cargo metadata --manifest-path src-tauri/Cargo.toml --locked --no-deps --format-version 1`
- 版本校验脚本：匹配输入返回 0，不匹配输入返回非 0。
- `pnpm check`
- `pnpm tauri build --no-bundle`
- `git diff --check`

本次不新增应用测试：没有运行时行为变化。发布关键行为由工作流前置校验和聚焦 shell 测试保护。

## Rollback Plan

恢复两个删除的版本字段、移除版本校验 job，并恢复原发布文档。没有数据迁移或不可逆状态。

## Risks

- 若未来重新需要发布前端 npm 包，应重新评估 `package.json` 版本策略。
- Tauri 对 Cargo 版本的回退依赖其受支持配置行为，需通过实际构建验证。

## Documentation Updates

更新 `docs/release.md` 的发布前检查、发布命令和注意事项。Directory Map 不需要更新。
