---
id: QB-20260820-file-browser-navigation-continuity
status: archived
archived: 2026-09-02
legacy: true
---
# File Browser Navigation Continuity Plan

## Requirement

为文件浏览器增加与“返回上级”配对的前进导航，并在父子目录往返及目录重载时恢复原有浏览位置。

## Scope

- 文件窗格实例内维护前进分支、目录滚动位置和选中项。
- 去除 workspace canonical path 回写造成的同路径重复读取。
- 使用 DOM 提交阶段与可见行锚点恢复列表位置。
- 新增前进图标按钮，复用现有文件导航栏布局和交互状态。
- 覆盖普通目录、本地盘符根目录、刷新和导航失败。
- 不持久化历史，不改变路径协议或 workspace schema。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/components/Icon.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

- `FileBrowserPane` 使用路径键保存 `{ scrollTop, selectedPath, anchorPath, anchorOffset }`；离开目录前记录首个可见文件行及其相对内容视口的偏移。
- 目录请求成功后仅设置 listing 与 pending restoration；`useLayoutEffect` 在新文件行提交到 DOM 后优先按锚点恢复，锚点缺失时使用 `scrollTop`。
- `initialPath` effect 在目标已经等于当前已加载 canonical path 时跳过，避免 `onPathChange` 回写引发第二次请求和覆盖位置缓存。
- 返回成功后将离开的路径压入前进栈；前进成功后弹出。普通目录打开或路径提交成功后清空前进栈。
- 刷新、重试和文件操作重载直接调用底层 load，不修改前进栈，并恢复当前位置。
- 本地盘符根目录返回到虚拟根时同样记录盘符路径；从虚拟根前进可重新进入该盘符。
- 在既有 `Icon` 集合增加同笔画风格的 `forward`，导航栏恢复为两个 25px 导航按钮加路径和三个操作按钮。

## Acceptance To Verification

- 滚动连续性：父目录滚动后进入子目录，返回断言父目录 `scrollTop` 和选中项恢复。
- 受控回写：测试 Harness 将 `onPathChange` 写回 `initialPath`，断言每次导航只有一次 IPC 读取且位置恢复不被取消。
- 内容变化：模拟锚点前插入文件行，断言锚点保持原视口偏移；锚点缺失时验证像素回退。
- 前进连续性：返回后前进按钮启用，前进断言子目录路径和位置恢复，随后按钮禁用。
- 分支与失败：打开新目录清空前进；失败导航不产生错误历史。
- 样式与无障碍：按钮有明确 aria-label、disabled 状态，style contract 断言导航栏列数。

## Test / Verification

1. 先添加受控 `FileBrowserPane` Harness、重复请求和锚点恢复失败回归测试。
2. 运行 `pnpm vitest run src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts`。
3. 运行 `pnpm check`。
4. 运行 `git diff --check` 并检查无无关文件改动。

## Documentation Updates

- 新增本 task spec 与 Standard plan。
- Directory Map 不更新；模块与入口职责不变。
