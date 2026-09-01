---
id: QB-20260820-about-page-update-strategy
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

在关于页面落地只提示、不下载的手动更新检测，并保持未来替换 updater 实现的边界。

## Scope

包含 GitHub Latest Release adapter、稳定版版本比较、关于页面状态、固定 Releases 外部入口、最小 Opener 权限和相邻测试；不包含 updater、签名、CI 改造、下载、安装、重启或后台检查。

## Affected Files

- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/InfoDialogs.test.tsx`
- `src/lib/updateCheck.ts`
- `src/lib/updateCheck.test.ts`
- `src/components/dialogs/aboutUpdate.css`
- `package.json` / `pnpm-lock.yaml`
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- 本 task spec 与 plan

## Design

`src/lib/updateCheck.ts` 是唯一 GitHub/Tauri adapter：读取当前应用版本、请求 Latest Release、校验 transport DTO、比较稳定 SemVer，并暴露项目 DTO。HelpDialog 只编排 idle/checking/latest/available/error，检查中禁用按钮。发现新版时调用 Opener，capability 只允许固定 Releases URL。远程 notes 和资产 URL 不进入 UI。

## Acceptance To Verification

- 版本比较、HTTP/网络/格式失败和固定 URL：`updateCheck.test.ts`。
- 项目元数据、检测状态、重复点击、下载入口：`InfoDialogs.test.tsx`。
- 内容稳定、键盘焦点与 reduced-motion：组件测试及生产构建。
- 全局回归：`pnpm check`。

## Test / Verification

1. 先写失败测试，再运行 `pnpm test -- src/lib/updateCheck.test.ts src/components/dialogs/InfoDialogs.test.tsx`。
2. 按需补充 `appStyles.test.ts` 的 about-page 布局断言。
3. 运行 `pnpm check`。
4. 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `cargo test --all-targets --all-features`。

## Verification Result

- 定向前端测试：2 个文件、9 项测试通过。
- `pnpm check`：ESLint、38 个测试文件 / 236 项测试、TypeScript 与 Vite 生产构建通过。
- `cargo check` 与 `cargo clippy --all-targets --all-features -- -D warnings` 通过。
- `cargo test --all-targets --all-features`：116 项通过、2 项环境依赖测试忽略。
- `cargo fmt --check` 被仓库既有的 CRLF 换行状态阻塞；未批量改写无关 Rust 文件。

## Documentation Updates

更新本 spec 记录已采纳的通知型检测边界。新增 adapter 不改变既有模块所有权，Directory Map 无需更新。
