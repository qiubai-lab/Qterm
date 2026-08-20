## Requirement

消除远程文件连接过程中的误报，并将真实连接失败统一显示在文件窗口顶部。

## Scope

调整文件浏览组件的连接状态判断、文件块的错误展示归属及相邻回归测试；不改后端和会话协议。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/workspace/LayoutView.tsx`

## Design

目录加载函数在 SFTP 未连接时静默退出并清理局部加载状态。连接错误由 `status === "failed"` 与 `runtime.notice` 派生，在文件导航栏下方渲染；文件块不再额外渲染同一 notice。

## Acceptance To Verification

- 非失败状态静默：组件测试验证不出现错误且不调用远程目录接口。
- 明确失败：组件测试验证具体原因和顶部 DOM 位置。
- 成功续载：rerender 测试验证连接成功后请求目录。
- 无重复提示：代码路径与全量测试验证文件块不再渲染外部 notice。

## Test / Verification

1. 先修改测试表达上述状态规则并确认旧实现失败。
2. 调整派生错误和加载守卫。
3. 运行文件浏览聚焦测试。
4. 运行 `pnpm check`。

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期项目上下文或 Directory Map。
