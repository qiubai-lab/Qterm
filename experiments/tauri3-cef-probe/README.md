# macOS Tauri 3 + CEF probe

Independent experiment on `codex/tauri3-cef-probe`; production Qterm remains Tauri 2. This is a small browser/transport probe, not a Qterm port. Its own pnpm workspace, Cargo workspace, lockfiles, bundle ID and data directories prevent dependency or profile sharing with production.

## Build

Requires macOS, Rust >=1.95, Node 22, pnpm 11.0.8, Xcode command-line tools, CMake and Ninja. Versions are pinned: Tauri `3.0.0-alpha.5`, runtime-cef `3.0.0-alpha.6`, CLI `3.0.0-alpha.5`, CEF Rust bindings `154.5.0` (CEF `154.0.34`, Chromium `154.0.8037.98`). The build downloads and validates the matching official CEF archive.

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
  --dmg 'src-tauri/target/release/bundle/dmg/Qterm CEF Probe_0.1.0_aarch64.dmg' \
  --output artifacts/latest --samples 10
```

Port 3000 must be unused for a local sentinel; the script fails rather than stopping any existing service. It creates two temporary OpenSSH servers, host/client keys, pinned known_hosts and authenticated SOCKS tunnels. It ignores user SSH configuration and agent identities. Servers share the host OS but serve distinct target ports; the byte-transparent fixture gateway maps the browser destination `localhost:3000` to each target through SSH. It never rewrites HTTP, Cookie, Origin or WebSocket bytes. Temporary keys, profiles and processes are cleaned up on normal success/failure. Test logs contain synthetic identities only.

The alpha runtime asynchronously posts its initial URL after browser creation. The app waits for its requested `about:blank` to finish before proxy setup and navigation; otherwise the delayed blank load can overwrite the real page.

The app's parent controls it through stdin JSON; guest pages have no privileged application commands. Each browser starts at `about:blank`; the adapter applies and checks the complete public CEF RequestContext preference before navigating:

```json
{"mode":"fixed_servers","server":"socks5://127.0.0.1:<connection-port>","bypass_list":"<-loopback>"}
```

The subtraction rule disables Chromium's implicit loopback bypass. No DIRECT fallback is configured. The global initialization proxy is a process-owned loopback listener that rejects every connection. This matters because alpha.6 reapplies global preferences when a new context opens the same cache directory: until the per-connection proxy is restored, existing requests may fail, but must never become direct traffic. Each connection owns a separate data directory; tabs of the same connection share it. This avoids the alpha runtime's per-webview `proxy_url` setter, which currently overwrites the preference without `bypass_list`.

The matrix covers original localhost origin, HTTP POST, HttpOnly/Secure/path/domain/expiry/deletion/multiple cookies and credentials omission; native WebSocket text/binary/close; classic/module/blob workers; strict CSP; Service Worker/Cache Storage/IndexedDB/localStorage isolation; same-connection tab sharing; independent logout; disconnection, existing socket loss, B continuity and A recovery; no direct local fallback. Release process-tree RSS and macOS `footprint` Summary Footprint are externally sampled for idle, one SSH page, two SSH pages and closed pages, with all process IDs and commands retained.

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

## 实测结果（2026-10-29）

macOS 26.5、Apple Silicon arm64、16 GiB RAM，独立 Release 应用。最终原生矩阵 **63/63 通过**；两个 OpenSSH 服务均记录了公钥认证，IPv4/IPv6 本机 3000 哨兵命中均为 0。打包签名和 DMG 校验通过，`cargo fmt` / `cargo clippy -D warnings` 通过。另行发送 SIGINT 验证：中断被记为失败，测试应用、SSH 客户端和 sshd 均已清理。

| 产物 | 实际字节数 | MiB（1024² 字节） |
|---|---:|---:|
| `.app` 文件逻辑大小（不重复计符号链接） | 350,480,436 | 334.24 |
| DMG | 148,199,600 | 141.33 |
| 其中 Frameworks 目录文件 | 336,443,576 | 320.86 |

每阶段等待 3 秒后，采样 10 次，间隔约 1 秒（另加工具耗时）。`footprint` 对同一进程集合计算 Summary Footprint；RSS 是各进程常驻页之和，会重复统计共享页。下表均为 **MiB**。

| 场景 | footprint 最小 / 中位 / 最大 | RSS 中位数 | 首次采样进程数 |
|---|---:|---:|---:|
| 仅主窗口 | 211.4 / 212.8 / 214.3 | 627.5 | 7 |
| 主窗口 + 1 个 SSH 网页 | 250.2 / 252.1 / 252.4 | 730.4 | 8 |
| 主窗口 + 2 个独立 SSH 网页 | 292.5 / 294.5 / 294.7 | 821.0 | 9 |
| 关闭 SSH 网页后 | 207.4 / 208.8 / 209.2 | 551.8 | 6 |

这些是小型静态页面和测试脚本的测量，不代表完整 Qterm 的内存，也不是与 WKWebView 比较后的增加量。没有执行长时间压力或泄漏测试。

**可行性判断：CEF 能保留原始 localhost Origin，经真实 SSH 正常承载原生 Cookie 和 WebSocket，并隔离两套同源浏览环境；当前 alpha 仍不适合直接替换正式版。** 同连接新增窗口会重置共享 profile 的代理，本轮连续请求中出现 12/31 次失败，随后恢复；未直连或串线。拒绝连接的初始化代理保障了失败时不绕过 SSH，但不能消除这段中断。正式接入需要解决 RequestContext 初始化/复用，达到新增标签不影响已有请求，并继续测真实开发框架、远程 SSH、重启持久化、正式签名与另外两平台。

另一个已修复的初始化问题是异步 `about:blank` 覆盖导航：等待初始页面完成后再设置代理并导航，复测通过。初始诊断与最终结果分开保存在忽略的 `artifacts/` 中，未把失败轮次当作通过证据。

- 完整逐项结果、每次内存采样、进程集合、SSH 日志、请求身份及 SHA-256：[`evidence/results.json`](evidence/results.json)。
- 构建/签名/DMG 证据：[`evidence/verification.json`](evidence/verification.json)。
- 中断检查：[`evidence/interruption.json`](evidence/interruption.json)。
- 当前机器可安装包：`artifacts/release/Qterm CEF Probe_0.1.0_aarch64.dmg`，本地 ad-hoc 签名，未公证。
- 当前 `.app`：`/Volumes/DATA/BuildCache/qterm-cef-probe/target/release/bundle/macos/Qterm CEF Probe.app`。

DMG SHA-256：`1f024d6cb9c87adf511689fa93c63ba2fbe0259437c454ceb1edc106c72f72a4`。
