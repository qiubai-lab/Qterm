---
id: QB-20260820-file-browser-navigation-continuity
status: archived
archived: 2026-09-02
legacy: true
---
# File Browser Navigation Continuity

## Goal

用户在本地或远程文件管理中进入目录、返回上级和再次前进时，能够回到先前浏览的位置，避免目录列表每次重新定位到顶部。

## Scope

- 保留“返回”按钮进入当前目录上级目录的既有语义。
- 在返回后提供“前进”按钮，重新进入刚离开的目录；连续返回支持按相反顺序连续前进。
- 按目录路径保存滚动位置和选中项，重新进入已访问目录时恢复。
- 使用可见文件行作为位置锚点；目录内容发生变化时仍尽量保持原视口位置。
- workspace 将 canonical path 回写给文件窗格时，不重复读取已经加载的同一路径。
- 打开新的目录分支或提交新路径后清空已有前进分支。
- 本地盘符虚拟根目录继续遵守相同的返回/前进语义。

## Constraints

- 历史与浏览位置是文件窗格实例内的瞬时 UI 状态，不写入 workspace schema。
- 不改变本地路径、远程 canonical path 和 profile 身份隔离规则。
- 复用现有 25px 图标按钮、焦点和 disabled 状态，不引入新的导航组件或依赖。

## Non-Goals

- 不增加完整的任意历史下拉列表、面包屑或跨应用重启的滚动恢复。
- 不改变浏览器前进/后退快捷键或鼠标侧键行为。
- 不修改文件列表排序、预览和传输协议。

## Acceptance

1. 用户进入子目录后点击返回，加载父目录并恢复离开父目录时的滚动位置和选中项。
2. 返回成功后前进按钮可用；点击后重新进入刚离开的子目录并恢复其浏览位置。
3. 没有前进目标、正在加载或目标不可用时，前进按钮明确禁用。
4. 用户在返回后打开其他目录或提交新路径，旧前进分支被清空。
5. 刷新、失败重试和文件操作后的重载不破坏当前目录的浏览位置。
6. 内部导航写回受控 `initialPath` 时，同一 canonical path 不产生第二次目录请求，也不取消待执行的位置恢复。
7. 目录内容发生插入或删除时，优先根据原可见行及其视口偏移恢复；锚点不存在时回退到原 `scrollTop`。

## Acceptance To Verification

- 1、2：`FileBrowserPane` 组件测试模拟父子目录往返并断言 `scrollTop`、选中项和调用路径。
- 3、4：组件测试断言按钮 disabled 状态和新分支行为。
- 5：现有刷新、失败与文件操作测试加聚焦回归，最后运行 `pnpm check`。
- 6：使用实际更新 `initialPath` 的受控 Harness 断言请求次数与返回后的滚动位置。
- 7：组件测试模拟父目录内容变化并断言锚点偏移优先于旧像素位置。

## Open Questions

- 无。按用户描述保留返回上级语义，前进只重放由返回产生的目录分支。

## Recommended Approach

推荐在 `FileBrowserPane` 内维护前进路径栈，并使用以 canonical path 为键的浏览位置 Map。内部导航完成后只把 canonical path 通知 workspace；当相同路径作为 `initialPath` 返回时跳过重复加载。目录响应先提交列表和待恢复位置，再由 `useLayoutEffect` 在文件行进入 DOM 后恢复。位置同时保存首个可见文件行、行相对视口偏移、`scrollTop` 和选中项：优先使用锚点，缺失时回退像素位置。相比叠加 `setTimeout` 或多次 `requestAnimationFrame`，该方案消除了受控状态反馈竞争，并能适应目录内容变化。

## Next Skills

- `writing-qb-plans`（Standard）
- `qterm-interface-design`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（未改变目录、模块或持久化边界）
