# macOS Tauri 3 + CEF probe

Independent experiment on `codex/tauri3-cef-probe`; production Qterm remains Tauri 2. This is a small browser/transport probe, not a Qterm port. Its own pnpm workspace, Cargo workspace, lockfiles, bundle ID and data directories prevent dependency or profile sharing with production.

## Build

Requires macOS, Python >=3.12, Rust >=1.95, Node 22, pnpm 11.0.8, Xcode command-line tools, CMake and Ninja. Versions are pinned: Tauri `3.0.0-alpha.5`, runtime-cef `3.0.0-alpha.6`, CLI `3.0.0-alpha.5`, CEF Rust bindings `154.5.0` (CEF `154.0.34`, Chromium `154.0.8037.98`). The build downloads and validates the matching official CEF archive. Version 0.1.1 additionally uses a local context-reuse patch of the pinned runtime; it is not an unmodified upstream release.

```sh
cd experiments/tauri3-cef-probe
# Optional isolated build tools:
python3 -m venv /tmp/qterm-cef-build-tools
/tmp/qterm-cef-build-tools/bin/pip install cmake==4.4.4 ninja==1.13.2
PATH="/tmp/qterm-cef-build-tools/bin:$PATH" sh build.sh
```

`CEF_PATH` and `CARGO_TARGET_DIR` may point at external build caches. Outputs are under `$CARGO_TARGET_DIR/release/bundle/{macos,dmg}` (default `src-tauri/target`). The `.app` and DMG are ad-hoc signed for local verification, not notarized release artifacts. Run the packaged `.app`; CEF requires its framework/helper layout.

## Real SSH and memory test

```sh
python3 tests/run.py \
  --app 'src-tauri/target/release/bundle/macos/Qterm CEF Probe.app' \
  --dmg 'src-tauri/target/release/bundle/dmg/Qterm CEF Probe_0.1.1_aarch64.dmg' \
  --output artifacts/latest --samples 10
```

Port 3000 must be unused for a local sentinel; the script fails rather than stopping any existing service. It creates two temporary OpenSSH servers, host/client keys, pinned known_hosts and authenticated SOCKS tunnels. It ignores user SSH configuration and agent identities. Servers share the host OS but serve distinct target ports; the byte-transparent fixture gateway maps the browser destination `localhost:3000` to each target through SSH. It never rewrites HTTP, Cookie, Origin or WebSocket bytes. Temporary keys, profiles and processes are cleaned up on normal success/failure. Test logs contain synthetic identities only.

The alpha runtime asynchronously posts its initial URL after browser creation. The app waits for its requested `about:blank` to finish before proxy setup and navigation; otherwise the delayed blank load can overwrite the real page.

The app's parent controls it through stdin JSON; guest pages have no privileged application commands. Each browser starts at `about:blank`; the adapter applies and checks the complete public CEF RequestContext preference before navigating:

```json
{"mode":"fixed_servers","server":"socks5://127.0.0.1:<connection-port>","bypass_list":"<-loopback>"}
```

The subtraction rule disables Chromium's implicit loopback bypass. No DIRECT fallback is configured. A process-owned rejecting SOCKS listener protects initial context creation. The complete SSH proxy is applied **once per connection**; subsequent windows only verify its unchanged value. A conflicting gateway is rejected before window creation.

`prepare_runtime.py` verifies the original `tauri-runtime-cef 3.0.0-alpha.6` crate SHA-256, applies `patches/context-pool.patch` without fuzz and copies the small `patches/context_pool.rs` module into the ignored `runtime/` build dependency. Cargo patches only this independent workspace. The pinned upstream checksum is `1fc02ef8f4295b0036b1d6cbe99111e263b587c870f0d54d9bc386602f10b947`. All derived source hashes and the patch fingerprint are recorded in `runtime/tauri-runtime-cef/.qterm-patch.json`; repeated preparation checks them before reuse. Direct Cargo commands require `python3 prepare_runtime.py` first.

The CEF UI thread owns one initialized RequestContext for each canonical explicit profile directory. Reuse joins pending initialization, preserves custom-scheme registration and skips preference reapplication. Incognito and default contexts are not pooled; per-window `proxy_url` is rejected for pooled contexts. The app verifies CEF `is_same` for reused connections and both `is_same` / `is_sharing_with` against other connections, instead of inferring identity from cache paths. Connection-held references are released on Tauri Exit; the runtime pool is cleared before CEF shutdown. Closing a window never destroys its connection's context.

The controller serializes creation and retains the two test connections until app exit. Concurrent first creation is supported by the pool's pending queue in source but is not exercised by this serialized harness. A production integration still needs explicit connection retirement/eviction and broader lifecycle tests; retaining arbitrary profiles forever is not the intended production design.

The matrix covers original localhost origin, HTTP POST, HttpOnly/Secure/path/domain/expiry/deletion/multiple cookies and credentials omission; native WebSocket text/binary/close; classic/module/blob workers; strict CSP; Service Worker/Cache Storage/IndexedDB/localStorage isolation; same-connection native identity and storage sharing; simultaneous A/B traffic during 12 window open/close cycles; original WebSocket continuity; creator closure and reopen; independent logout; disconnection, existing socket loss, B continuity and A recovery; no direct local fallback. Release process-tree RSS and macOS `footprint` Summary Footprint are externally sampled for idle, one SSH page, two SSH pages and closed pages, with all process IDs and commands retained.

## Boundaries

- Uses fresh disposable profiles and synthetic cookies. `SecretStorage::Mock` deliberately avoids user Keychain prompts and offers no meaningful at-rest encryption. Production must use the OS secret store and test signing/Keychain behaviour separately.
- macOS sandbox is required. No web security or certificate checks are disabled. WebRTC non-proxied UDP is disabled; WebRTC behaviour itself is not part of this matrix.
- The fixed proxy is connection-wide; this fixture allowlists only localhost:3000. A production router needs an explicit policy for other destinations, redirects, downloads and popups.
- Tests use small local pages and local sshd instances, not a full Vite/Next.js application or a remote network. They do not prove arbitrary developer-framework compatibility, latency, remote SSH reliability, or Windows/Linux operation.
- Cookie logout is tested; complete browser-data deletion, cross-process persistence/restart, pre-existing Service Workers before proxy setup, and long-running leak behaviour require further validation.
- RSS sums resident memory across the process tree and may count shared pages repeatedly. The same process set is also passed to macOS `footprint`; its Summary Footprint is reported separately. Neither metric is the incremental cost of migrating full Qterm. No WKWebView baseline is claimed.
- Tauri 3 + CEF is alpha. This experiment does not make it a production-ready three-platform replacement.

## Sources

- [Tauri 3 CEF setup](https://v3.tauri.app/develop/cef/)
- [Tauri runtime choice](https://v3.tauri.app/develop/webview-runtime/)
- [Published CEF runtime API](https://docs.rs/tauri-runtime-cef/3.0.0-alpha.6/tauri_runtime_cef/)
- [Chromium proxy rules and implicit bypass subtraction](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md)

## 0.1.1 实测结果（2026-10-29）

**同连接新建窗口导致已有 HTTP 短暂失败的问题已在独立验证版修复。** 这依赖实验目录中的固定版本本地运行时补丁，不能解读为官方 alpha.6 已修复。Qterm 正式版源码、依赖和配置未修改。

严格回归在未修复的 0.1.0 上复现：开关 12 个窗口期间 A 失败 81 次、B 失败 75 次。修复后首轮 94/94 通过，扩展“关闭最初窗口后另一窗口继续工作”测试后，最终 **97/97 通过**：

- A 的 172 次、B 的 166 次连续 HTTP 请求均成功；原有 WebSocket 没有关闭或重连，消息序列连续。
- 全程创建 19 个客体窗口；首次创建 A/B 两个上下文，另外 17 次复用均由 CEF `is_same` 原生比较确认。A/B 的 `is_same` 和 `is_sharing_with` 均为否。
- 关闭最初 A 窗口并另开窗口时，存活窗口的 27 次 HTTP 请求全部成功，原有 WebSocket 保持连接。关闭全部 A 窗口后重开仍复用同一个连接上下文。
- Cookie（HttpOnly、Secure localhost、路径/域、过期/删除、多 Set-Cookie、credentials）、页面/classic/module/blob Worker WebSocket、严格 CSP、Service Worker/Cache Storage/IndexedDB/localStorage、独立退出登录、SSH 断线/恢复均通过。
- 同连接尝试更换代理端口在创建窗口前被拒绝；IPv4/IPv6 本机 3000 哨兵均为 0 次命中。
- 正常退出和已有 A/B 上下文时的 SIGINT 测试均确认：先释放两个连接持有引用，再释放两个池中上下文，随后正常结束 CEF；中断不会报成功，无残留应用/SSH/sshd 进程。

`.app` / DMG 校验通过，只读挂载 DMG 中的主程序 SHA-256 与实测应用一致。`cargo fmt`、新增 pool 模块格式、Python 编译与源码规模检查通过；应用 Clippy 严格检查通过，上游依赖仍有既有 `devtools_enabled` 未使用字段 warning。CEF/macOS stderr 诊断保存在验证 JSON 中，未把断言通过描述为日志完全无诊断。

### 包与内存

macOS 26.5、arm64、16 GiB RAM，Release 构建；每阶段等待 3 秒后采样 10 次，间隔约 1 秒（另加工具耗时）。

| 产物 | 实际字节数 | MiB |
|---|---:|---:|
| `.app` 文件逻辑大小（不重复计符号链接） | 350,485,524 | 334.25 |
| DMG | 148,216,657 | 141.35 |

| 场景 | footprint 最小 / 中位 / 最大 MiB | RSS 中位 MiB |
|---|---:|---:|
| 仅主窗口 | 208.4 / 213.6 / 213.8 | 608.8 |
| 主窗口 + 1 个 SSH 网页 | 247.6 / 249.5 / 249.8 | 732.8 |
| 主窗口 + 2 个独立 SSH 网页 | 286.2 / 288.2 / 288.4 | 853.1 |
| 关闭网页、保留两个连接上下文 | 300.6 / 315.3 / 318.3 | 892.0 |

关闭窗口后连接仍存在，所以保留其 RequestContext、缓存和可能活跃的 Service Worker；本轮测试也比 0.1.0 更重。不能把两轮内存差值当作补丁净增量。正式接入时必须按真实连接生命周期回收上下文；当前验证器只有 A/B 两个受控连接，统一在进程退出时释放。RSS 会重复计共享页；footprint 是 macOS 对同一进程集合的 Summary Footprint。以上不是完整 Qterm 或真实开发项目的测量，也不证明长期无泄漏。

### 证据与入口

- 修复前严格失败证据：[`evidence/context-baseline.json`](evidence/context-baseline.json)。
- 首轮通过：[`evidence/context-first-pass.json`](evidence/context-first-pass.json)。
- 最终逐项结果、原生身份、SSH 请求/认证、内存与 SHA-256：[`evidence/context-reuse-results.json`](evidence/context-reuse-results.json)。
- 源码补丁指纹、检查输出、签名及 DMG：[`evidence/context-reuse-verification.json`](evidence/context-reuse-verification.json)。
- 带上下文的中断退出：[`evidence/context-interruption.json`](evidence/context-interruption.json)。
- 当前安装包：`artifacts/release/Qterm CEF Probe_0.1.1_aarch64.dmg`（本地 ad-hoc 签名，未公证）。
- 当前 `.app`：`/Volumes/DATA/BuildCache/qterm-cef-probe/target/release/bundle/macos/Qterm CEF Probe.app`。
- 原 0.1.0 的 `evidence/results.json` 等文件保留为历史结果；原报告可从 Git 提交 `b74e572` 查看。

DMG SHA-256：`fc5dc319e18b352b73d2c58f387d705220bd6d91176eecbaa1054f58f86f783d`。
