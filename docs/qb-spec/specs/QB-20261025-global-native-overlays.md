---
schema: 1
id: QB-20261025-global-native-overlays
type: design
tier: standard
status: active
created: 2026-10-25
updated: 2026-10-25
supersedes: []
---

# 全应用弹层与原生网页共存：根因与公共修复方案

用户已明确要求“请你落地修复”，授权实施本方案。以下根因记录来自前一轮分析；本次实现与验证记录追加于文末。

## 直接根因与证据

当前黑屏有一条确定的代码路径：

```text
任意组件挂载 role=menu / role=dialog
  → webModel.webSurfaceVisible 全局扫描 document
  → 节点不匹配 webNativePanelSelector 中的七种名称
  → 所有可见 Web Block 得到 visible=false
  → useWebBrowser 通过 web_sync 发送
  → WebHost::sync 调用 view.hide()
  → 原生网页消失，露出宿主深色背景
```

- `src/web/webModel.ts:17`：按 ARIA role 推断全局阻挡；没有检查弹层与网页的相交区域、实际绘制状态或 `aria-modal`。
- `src/web/useWebBrowser.ts:85`：每个 guest 都独立执行上述全局判定。
- `src-tauri/src/infrastructure/web/mod.rs:160`：`visible=false` 直接隐藏原生视图；该路径本身不销毁 guest、不重新导航。
- 截图中的终端菜单对应 `src/terminal/TerminalContextMenu.tsx:37`，文件菜单对应 `src/files/FileBrowserPane.tsx:690`。两者都是没有原生白名单标记的 `role=menu`。
- `src/web/webSurfacePanels.ts:4`：白名单仅包含 address-history、library、data-cleanup、tab-menu、host-summary、connection-picker、connection-group。

因此，当前实现足以解释截图；无需假设远端页面错误、SSH 中断或 GPU 崩溃。本次未对用户正在运行的应用进行原生复现，不排除独立的其他渲染故障。

## 为什么反复修复仍会复发

之前的修复改变了例外，没有改变默认规则。归档的 `QB-20261025-web-native-surface` 和 `QB-20261025-web-overlay-fix` 明确保留了 dialog/menu 全量隐藏；后续逐步豁免了历史、抽屉、网页标签菜单和连接气泡。`0603e98` 又增加了三个连接弹层名称。

`src/web/webModel.test.ts:26` 把普通菜单/对话框导致隐藏写成预期；`webTabMenuSurface.test.tsx:56` 也要求普通 dialog 出现后 `visible=false`。这些测试保证旧策略稳定，不能证明所有弹层共存正常。

`role=dialog` 可以用于非模态气泡，`role=menu` 不等于全屏遮挡，ARIA 语义不适合作为绘制策略。跨组件的绘制规则归属在 Web feature 的名称白名单，使每个新菜单都需要知道浏览器实现细节。

目前普通 `role=tooltip` 已走局部裁剪；“所有气泡都必然黑屏”不是代码的严格现状。仍失败的普通 menu/dialog，与已经修复的 tooltip/白名单气泡必须分开验证。

## 平台约束与相关缺口

网页由 `windows.rs` 中 `Window::add_child` 创建，`windows_surface.rs` 使用独立 HWND 容器和 `SetWindowRgn`。它不是宿主 DOM 中的 iframe。宿主 CSS z-index 或 Portal 只能调整宿主内部元素，无法单独解决原生子窗口覆盖宿主弹层的问题。微软对 [Windowed 与 Visual hosting](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/windowed-vs-visual-hosting) 的说明确认了 HWND 托管与合成托管的区别。

已经存在的局部裁剪可继续复用，但不能直接把所有 role 都放入其中：

1. **透明材质**：终端/文件菜单使用透明背景、backdrop-filter、opacity 和 scale 动画。挖掉原生区域后，透明处采样到的是宿主背景；这会留下黑角、黑框或动画闪烁。只补一个 data 属性不完整。
2. **全屏模态遮罩**：只裁剪对话框本体会让其余原生网页盖住 DOM 遮罩；裁掉整个遮罩范围又会露出深色宿主。需独立的画面保留策略。
3. **裁剪预算**：`webSurfaceOcclusion.ts` 用 `slice(0, 64)`，`webSurfacePanels.ts` 用 `slice(0, 8)`，后端也有相同上限。诊断确认三个半径 12px 的独立圆角面板合计需要 75 条裁剪带，组合时仅保留 64 条。它不是两张截图整页黑屏的直接原因，但会妨碍推广到全应用。
4. **输入边界**：原生网页的 pointer 事件不冒泡到宿主 document。现有 `useNativeWebDismiss` 只覆盖少数气泡；让文件/终端菜单保持网页可见后，还必须确保点击网页可以关闭菜单且不抢回焦点。GotFocus 只反映焦点变化，不能当作所有点击事件。
5. **生命周期与性能**：每个 guest 每帧重复读取全局 DOM，裁剪与边缘又各采样一次。同一帧应共用一次测量；异步 native 同步必须合并最新意图并处理过期结果。

## 目标与方案比较

目标是让所有业务弹层通过同一份公共契约，明确绘制范围、交互阻挡和生命周期；浏览器不再识别终端/文件/Git 的业务名称。

| 选项 | 能解决什么 | 局限与结论 |
| --- | --- | --- |
| 继续扩充白名单 | 快速修复点名的菜单 | 新组件继续遗漏，模态与透明问题仍在；不采用 |
| 去掉菜单隐藏，只按所有 ARIA role 裁剪 | 缓解部分黑屏 | 混淆语义、透明遮罩、关闭动画及原生输入仍不完整；不采用 |
| 公共弹层注册 + 统一原生表面协调 + 模态画面替代 | 复用现有 HWND 能力，覆盖跨组件弹层、模态、输入与恢复 | 推荐；普通菜单实时，模态期间背景使用静态画面，需验证切换时序 |
| Visual hosting / 合成控制器 | 为持续实时透明叠加提供更大的控制空间 | 必须重做相应合成、输入、焦点、可访问性与 Tauri/Wry 集成；不是换一个开关就能让 DOM 与 guest 自由交错，作为未来专项 |

推荐方案的产品取舍：普通菜单/气泡出现时网页继续实时绘制；全屏模态窗期间保留打开前的网页画面，网页后台生命周期保持，但不承诺视频、动画或计时器继续按可见状态刷新。若模态背景也必须实时更新，应选择原生合成路线，不能把截图方案宣称为完整实时合成。

## 公共架构

### 1. 与业务名称无关的 Overlay Registry

建议由 `src/components/overlays/` 拥有注册、卸载、层级、父子弹层、进入/退出阶段和关闭意图，复用并逐步归并 `DialogFrame` 的顶层 Escape/focus stack。它不持有 SSH、标签页、导航或浏览器 session 状态。

公共 hook/薄容器提供：元素 ref、owner/scope、父层、模态性、绘制材质、clip owner、present phase、dismiss reason。具体菜单项、业务回调和布局继续由 feature 所有。

重要区分：

- owner 表达生命周期归属；不能用“不同 Block”排除真实的几何重叠。
- scope 表达输入阻挡范围；模态性与 ARIA role 分离，仍正确输出无障碍语义。
- clip owner 表达抽屉等被父容器裁切的可绘制区域。
- present 覆盖退场动画，不能在关闭状态刚置为 false 时就释放裁剪。
- `aria-hidden`/`inert` 表达可访问或输入状态，不单独代表没有像素；零尺寸、实际 display/visibility、裁切结果和 present 决定是否绘制。

新弹层使用公共 API 后自动获得原生共存能力。迁移期间的旧 data 标记最多作为统一适配器；完成迁移后删除业务名称白名单、基于 role 的全局隐藏和对应的 feature 专属覆盖规则。

### 2. 一个原生表面协调器

建议 `src/web/surface/` 拥有纯几何/策略模型与 `NativeSurfaceCoordinator`。它消费中立的弹层记录和存活网页 surface，不拥有业务弹层开关。`useWebBrowser` 保留 guest 生命周期，只注册/更新表面并委派同步。

数据流：`业务弹层 → Overlay Registry → 一次布局测量 → 各 surface 的绘制/输入计划 → 薄 IPC → Windows adapter`。

每轮使用同一份不可变测量快照计算 visible、occlusions、rounded panels 和输入阻挡。几何交集决定受影响的网页；多 Block、跨边界菜单和 portal 同样处理。普通菜单完全在邻居 Block 内时，对浏览器不发隐藏指令、不改裁剪。

以注册/卸载、ResizeObserver、滚动、窗口/DPI/主题变化标脏；拖拽、CSS transform/clip 动画期间按帧测量，结束后停止。仅用 ResizeObserver 无法跟踪 transform，不能因此漏帧。每个 guest 至多一个同步请求在途，新意图合并为最新 revision；guest generation、工作区切换、卸载和锁屏使旧回调失效。

### 3. 三类绘制策略

| 场景 | 绘制 | 输入与恢复 |
| --- | --- | --- |
| tooltip、右键菜单、下拉、非模态气泡/抽屉 | guest 保持可见，只扣除实际绘制交集 | 弹层接收自身输入；网页其余区域可交互；关闭恢复 region，无 reload/重建 |
| 应用/区域模态窗及全屏遮罩 | 受影响 guest 用短暂快照替代，再由宿主统一画遮罩/弹窗 | 在原生层阻断受影响 guest 的鼠标、触摸、键盘/焦点；最后一个模态退出后恢复 |
| 锁屏、非活动工作区/标签、关闭或断开 | 按原有生命周期隐藏/关闭 | 锁屏立即生效，删除临时画面；不显示敏感网页截图 |

布局拖拽单独声明过渡策略，使用与模态相同的受控快照桥接或经原生验证的实时位置更新；不再让任意 `.drag-ghost` 节点隐式触发无画面替代的全局隐藏。系统文件对话框沿用现有异步 native dialog bridge，独立管理输入阻挡，不伪造 DOM modal 来触发隐藏。

### 4. 局部弹层的公共原生兼容外壳

与原生网页相交时，公共外壳使用主题化不透明底、内描边，以及平移/裁切动画；原生圆角边缘和 DOM 外壳消费同一份半径、描边、背景、层级数据。不继续给每一种菜单写一段 `webNativePopovers.css`。

基础内容、菜单语义和键盘导航保留。此方案不承诺在局部原生交叠区域保留真实背景模糊；透明阴影也必须由原生合成明确实现或收敛为受支持外观，不能盲目扩大挖孔。

裁剪预算以“完整覆盖每个弹层”为不变量：优先在后端接收有界的矩形/圆角形状并生成 native region，减少传输的条带数量；仍使用条带时先合并且整体分配预算。所有剩余上限必须有显式、可测试的降级路径，例如受影响 surface 的快照桥接，禁止静默 slice 或用整页裸隐藏兜底。

### 5. 模态快照与输入事务

利用 WebView2 [CapturePreview](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2#capturepreview) 获取宿主管理的短暂画面，不在客体注入截图逻辑，也不授予客体 IPC。官方接口明确：首个 ContentLoading 前会失败，导航时还可能取得前一文档，因此必须校验文档代次。

建议事务阶段为 `live → preparing → covered → restoring → live`：

1. 登记模态与 generation，在 native 输入边界立即阻断 guest、把焦点交还宿主；DOM inert 不足以阻断独立 HWND。
2. guest 仍可捕获时取图，并校验 generation/document/尺寸。快照在宿主解码就绪后，再协调隐藏原生视图与呈现遮罩，不能先 hide 再等待 capture。
3. 嵌套模态共享受影响表面的覆盖状态，按 scope/层级计数；关闭子模态不能恢复被父模态阻挡的网页。
4. 最后一个相关模态的退出动画结束后，重同步最新 bounds、region、DPI，再恢复同一个 guest；异步晚到的 capture/restore 不得复活已经关闭/换页/锁定的表面。
5. 截图失败/超时不能无限等待。无有效画面时呈现明确的主题化暂不可预览状态并保持输入阻挡；保留上次画面仅限同 guest、同文档、同尺寸的有效快照。锁屏不用旧快照。

快照仅在主 UI 内存中短期存活，有尺寸/字节数预算，退出、锁定、换页、关闭时及时释放，不写磁盘、不进入 Workspace 持久化或日志。

**实施前原生验证关口**：快照切换、真实鼠标/键盘阻挡、首次加载/导航中捕获、恢复首帧时序必须用独立 native fixture 验证。`show()` 返回或宿主 requestAnimationFrame 不等于原生首帧已绘制；必要时由原生临时覆盖面保护切换。未取得此证据前，不能声称模态恢复“无闪黑”。以上是待验证设计，不是已证明的平台保证。

### 6. 统一关闭与输入路由

公共事件桥把宿主 pointerdown、guest GotFocus 及必要的原生交互事件归一为来源明确的交互意图。只对作用范围匹配的最上层可关闭弹层执行 dismiss；固定抽屉、busy confirmation 等保持自身策略。原生事件只带受校验的 guest 标识和必要交互类型，不暴露网页表单内容。

点击网页关闭菜单时不恢复到原按钮/终端而抢走焦点；Escape 关闭时恢复合法触发点。新增原生 pointer 监听前先用 fixture 验证“网页已聚焦、键盘触发菜单”的场景，不能只靠 GotFocus。已有 `useNativeWebDismiss` 作为迁移入口，最终统一订阅，避免每个 feature 自己监听。

## 全量迁移范围

| 公共/业务入口 | 纳入的表面 |
| --- | --- |
| DialogFrame、ThemedTooltip/useThemedTooltip、TabActionMenu | 模态/非模态、tooltip、工作区及网页标签菜单 |
| TerminalContextMenu | 终端右键菜单及点击网页关闭 |
| FileBrowserPane、FileTextContextMenu | 文件/图片/编辑器菜单、操作确认 |
| NetworkPane | 规则菜单、编辑、删除确认 |
| GitRepositoryOverlays、GitPane、GitRepositoryHistoryPopover | 分支/操作/历史气泡、更改/提交菜单、子菜单、合并确认 |
| HostIdentity、TerminalTargetPicker | 主机概要、连接/分组选择气泡 |
| WebAddressHistory、WebDataPopover、WebLibraryDrawerFrame | 迁移全部既有白名单消费者，保留抽屉父级裁切 |
| ConnectionDialog 及其他管理器辅助浮层 | 管理器内菜单、tooltip、嵌套 dialog |
| Workspace 锁定/拖拽、Git 状态提示等非标准 portal | 显式登记绘制/交互策略，不能仅按 role 搜索后宣称全覆盖 |

审计 createPortal、fixed/absolute 浮层、role menu/dialog/tooltip/listbox/status、原生系统弹窗；原地 listbox、普通布局和 header portal 不误判为遮挡。为真实浮层入口建立迁移清单和开发/CI 接入检查，非弹层 portal 用明确理由排除。检测遗漏时报告位置；不要在运行时偷偷退回“所有网页隐藏”。

## 需求与 Behavior Delta

### MODIFIED

- REQ-001：普通弹层不得导致无关或未被遮挡的网页整页隐藏；同一 guest 的 URL、页面状态和生命周期保持。
- REQ-002：弹层注册、范围、绘制、退出和原生输入通过公共能力协调；新增业务组件无需修改浏览器名称白名单。
- REQ-003：模态窗显示有效背景画面并阻断原生交互，嵌套、失败及恢复有明确状态；锁屏继续立即遮蔽且不显示快照。
- REQ-004：多弹层的几何、圆角、主题、DPI 和动画均完整覆盖；达到资源预算时显式降级而不丢片或露出黑底。
- REQ-005：点击原生网页关闭适用弹层且保留网页焦点；Escape、键盘导航和模态焦点约束保持。
- REQ-006：布局采样和异步同步具备共享测量、合并、取消及过期保护，不增加持久化状态或 guest 权限。

## 验收与实施顺序

- AC-001 [REQ-001, REQ-002]：真实终端/文件/编辑器/Network/Git/工作区菜单分别在不相交、部分相交、跨两个 Web Block 时打开/关闭；不相交 guest 不收到隐藏，交叠外页面持续绘制，不触发 open/close/reload。
- AC-002 [REQ-002, REQ-004]：所有迁移入口均有公共契约；hidden/零尺寸节点不产生遮挡，非模态 dialog 不被当作 modal；退出动画、祖先裁切、圆角/描边和三主题保持；三个以上圆角弹层和达到预算时不静默丢区域。
- AC-003 [REQ-003, REQ-006]：真实 WebView2 验证模态/子模态、截取失败/超时、首次加载、导航中、DPI 改变、快速开关、关闭/切换 guest；按键/滚轮/触摸/鼠标不能绕过阻挡，恢复无裸黑帧，截图资源有界且清理。
- AC-004 [REQ-005]：各菜单点击原生页可正确关闭；已聚焦页面、键盘打开、Escape、Tab、busy 模态、无效触发点和父子弹层均符合焦点规则。
- AC-005 [REQ-001, REQ-003, REQ-006]：非活动标签/工作区、锁屏、断开/关闭、拖拽以及原生文件选择器保持正确行为；guest IPC 拒绝、URL 限制、代理与连接存储隔离不变。
- AC-006 [REQ-002, REQ-004, REQ-006]：多 Web Block 每轮共用布局测量，稳态无重复全局扫描/重复同步，动画可跟踪；1/1.25/1.5/2 倍 DPI 的 native fixture 和窗口移动/缩放通过；源码尺寸门禁、pnpm check 及受影响 Rust 检查通过。

建议按以下顺序实施，每一步留下可单独验证的模块：

- [x] 先改写旧的“普通菜单隐藏网页”预期，补真实终端/文件跨 Block 回归与几何/预算测试。
- [x] 建立 registry、纯表面策略与统一测量；接入共享 tooltip/menu/dialog 基座。大文件只接线，Files/Git/Workspace 的 baseline 文件不得继续累积编排。
- [x] 完成原生模态/input 原型、解码后宿主绘制机会及同一 compositor 恢复，确定降级与性能上限并接入快照状态机；逐帧无闪黑的显示器实测仍见下方缺口。
- [x] 按全量清单迁移其余弹层与输入关闭；删除白名单和旧 role 扫描，落实接入检查。
- [ ] 完成前后端与真实 Windows 矩阵验证、截图/录像及性能记录，再更新实际变化的 Directory Map。

建议实现 owner：公共注册/层级在 `components/overlays`，规则与 native 同步在 `web/surface`，IPC 在 `lib/tauri/web`，平台裁剪/快照/输入在 `infrastructure/web` 的独立模块。命令只验证/转发，不把策略堆进 `WebHost::sync`。不改 SSH、profile 数据格式或网页权限。

## 前次诊断验证（实现前）

已运行 6 个测试文件、31 项测试并全部通过，其中 7 项临时诊断用例刻画现有故障：真实终端菜单不相交仍隐藏；同一个 TabActionMenu 因是否带 `tab-menu` 标记出现不同结果；display:none / visibility:hidden / opacity:0 的非模态 dialog 仍隐藏；75 条圆角裁剪带被截为 64 条。临时用例验证的是现状，并非修复验收，运行后已删除。

既有 5 个测试文件为 webModel、webSurfaceOcclusion、webConnectionOverlays、webTabMenuSurface、useWebBrowser，使用 `pnpm exec vitest run ... --maxWorkers=2`。`pnpm check:source-size` 通过且 0 ratchet reminders。没有运行全量 pnpm check、Rust 检查或桌面视觉验收，因为本次没有应用实现变更。现有 13 个未提交源码文件保持不变。

## 本轮实现（2026-10-25）

公共契约落在真正绘制的根节点：`data-app-overlay="floating"` 表示局部不透明覆盖，`modal` 表示该根节点矩形范围内的输入隔离/预览桥接，`transition` 可用于完整过渡覆盖。DialogFrame 在 scrim 上声明 modal，非模态组件声明 floating；无障碍 role 不再参与网页可见性判断。抽屉额外声明 `data-overlay-clip="parent"`，reveal/slide 动画使用 `data-overlay-motion` 保留原有几何跟踪。节点存在、实际可见且有尺寸时才参与；退场的 inert/aria-hidden 节点继续保留绘制遮挡。

注册采用声明式 DOM 契约与一个 MutationObserver，避免给各业务引入第二套开关状态。终端、文件列表/图片/编辑器/上传、Network、Git、主机概要、连接选择、工作区菜单、共享 tooltip、管理器、提示气泡、引导卡和拖拽标签均已接入；旧七项白名单及两份业务专属 native CSS 已删除。新 JSX menu/dialog/tooltip 未声明公共属性会被 `overlayContract.test.ts` 拒绝。普通布局/header portal、列表中的原地 listbox 不登记为浮层；系统文件选择器仍使用既有 native dialog bridge。

`nativeSurfaceCoordinator` 使用一个 rAF 循环，每轮共享弹层/选中边框/主题采样，再对各网页求交集。MutationObserver 缓存根节点，不再为每个 guest 扫描全部菜单/对话框；隐藏 guest 不读取布局；稳态通过完整 bounds 去重，不重复 IPC。实现选择持续帧循环以覆盖既有 CSS transform/reveal 与拖动，没有实现原建议的全量脏标记后停帧优化；后续优化必须保留动画跟踪证据。

普通浮层仅挖去交集并通过原生透明边缘补齐圆角；与网页不相交时不改变可见性。64 个矩形/8 个 native panel 的传输上限继续保留，超过预算明确转为整页预览覆盖，不再静默 slice。浮层在 Web Block 存在时使用公共不透明主题底和内描边，外部阴影/真实背景模糊不作为原生合成承诺。

模态状态为原生输入阻断 → 有界截图/解码 → 宿主绘制机会 → 空 HWND region。整个过程保持 WebView2 controller 可见，不执行模态 hide/show，恢复时撤销空 region 并删除预览，不 reload/重建 guest。截图只存内存，限制 1.5 秒、16 Mi 像素和 16 MiB PNG；解码也有 1.5 秒上限。失败/初始加载/导航中使用明确的主题占位，页面就绪后重取；旧文档/旧尺寸预览立即失效，锁屏/隐藏/断开/卸载清除。同步写入和截图分别串行、合并最新意图，快速关闭不等待截图，连续缩放不会并发积压截图。两次 rAF 是宿主绘制机会，不将其表述成显示器帧提交保证。

原生可信 pointerdown 的固定消息与 GotFocus 进入同一表面交互入口，映射为所属 DOM surface 上的 pointerdown，复用业务的外部关闭处理；不生成 click、不传网页内容、不开放 guest IPC。原生窗口必须可见、启用且已聚焦才能转发固定消息。Git 历史气泡的外部关闭修正为不抢回触发按钮焦点，Escape/键盘关闭仍返回触发点。原有 `useNativeWebDismiss` 三个消费者保留兼容订阅，它不再决定绘制或隐藏。

### 验收证据与边界

| 验收 | 已执行证据 | 边界 |
| --- | --- | --- |
| AC-001 | `globalOverlays`、`crossFeatureOverlays` 使用真实 Terminal/FileBrowserPane/FileTextContextMenu/NetworkPane/Git history 入口；不相交与跨两页几何；真实 TabActionMenu + useWebBrowser 的 IPC/同实例回归 | 用户 SSH 页面没有代操作 |
| AC-002 | 全源码 JSX 接入检查；退出/inert/hidden、抽屉裁切、75 条圆角区域完整保留及预算降级、CSS 公共外壳和多倍率 raster 测试 | 不是每个菜单在三个主题中的逐一截图验收 |
| AC-003 | `surfaceSync` 覆盖延迟/失败/快速关闭/加载/导航/过期解码/锁定/连续缩放；真实 WebView2 验证预览像素、NULLREGION、EnableWindow/焦点与 controller 存活、恢复 URL 不变 | 实体触摸/滚轮、跨显示器 DPI、逐帧无裸黑画面的录屏未覆盖 |
| AC-004 | 真实业务外部关闭与焦点测试；既有键盘/模态测试；native fixture 验证相同焦点下重复通知以及禁用后拒绝通知 | 重复通知测试直接发送固定消息，不伪称实体鼠标输入测试 |
| AC-005 | 锁屏/隐藏/卸载单元及集成；原生代理/profile/命令拒绝、导航限制与恢复；拖拽标签改为显式局部绘制 | native 文件选择器不变，未新增实体文件选择验收 |
| AC-006 | 两个活跃+一个隐藏 guest 共享一次测量、稳态去重；六倍率 raster 和真实 Windows region/透明边框测试；源码门禁 | 实际多显示器移动和不同缩放的显示器矩阵仍未覆盖 |

真实原生截图与可复验命令见 [evidence README](../evidence/QB-20261025-global-native-overlays/README.md)。Directory Map 已同步公共 owner；没有改变 SSH、profile/Workspace 数据格式和客体权限。本轮验证不把正在并行修改的地址栏等无关改动算作本变更。

所需显示器/实体输入/逐帧视觉矩阵尚未完成，因此本 spec 保持 active，不把自动化和机制截图冒充全部人工验收，也不声明所有设备上绝无瞬时闪烁。核心黑屏路径已替换并有回归保护。

### 最终命令记录

- `$env:VITEST_MAX_WORKERS='2'; pnpm check`：通过；222 个测试文件通过、1 个跳过，1307 项通过、2 项跳过；Node 脚本测试、ESLint、TypeScript、Vite production build 均通过。默认并发曾使已有 workspaceTabDeck 动画用例 5 秒超时，降低 worker 后通过，没有提高超时或跳过该用例。
- 最后截图串行/合并修正：`pnpm exec vitest run src/web/surface src/web/webTabMenuSurface.test.tsx --maxWorkers=2`，3 文件 10 项通过；受影响文件 ESLint 通过。新测试中缺少必需回调和超出项目 TS lib 的数组 API 已修正，最终类型检查/构建通过。
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check` 与 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`：通过。
- `cargo test --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- --test-threads=2`：356 项通过、7 项按项目配置忽略。
- `cargo test native_webview_smoke --manifest-path src-tauri/Cargo.toml -- --ignored --nocapture --test-threads=1`：真实 WebView2 用例单独执行通过。
- `pnpm tauri build`：最终代码生成 Windows x64 MSI 和 NSIS 安装包，未安装或发布。Vite 仍有原有大 chunk 提示，MSVC 有导入库生成信息，均不阻断构建。
- `pnpm check:source-size`：通过、0 ratchet reminders；`git diff --check` 与 qb change validate 通过，无 trace 警告。

## 后续修复：保留动画并以连接状态节点统一全局 hover（2026-10-25）

用户先反馈鼠标移出后 tooltip 位置抖动/外观变化，随后明确要求保留动画，并以连接状态节点的气泡为参照统一全局 hover。根因是上一轮公共原生外壳强制 `opacity:1; transition:none`，却保留 themed tooltip 关闭态的 `translateY(-4px) scale(.97)` 和 160ms 卸载等待：关闭变成可见的瞬间跳位/缩小。

最终行为以用户最后指定的参照为准：当前原生网页场景中的连接状态节点使用 130ms、3px、`cubic-bezier(.16,1,.3,1)` 入场，移出后直接卸载。所有 hover tooltip 通过 `data-overlay-motion="hover"` 委派到 `components/hoverTooltip.css`，有无 Web Block 都使用同一入场动画，不再缩放文字/描边；减少动态效果关闭位移。菜单、抽屉、模态窗的独立动画策略保持。

已迁移按钮/溢出文字/DOM title、网页标签、连接状态节点、终端协议、Git 提交/远端/不可用原因、凭证安全提示与工作区数量提示。删去分散的 tooltip keyframes、无用的 transform-origin/offset 和延迟退场计时器；保留组件原有内容、尺寸、颜色、定位与键盘语义。DOM title 在直接切换目标时使用新的展示代次重新入场。源码契约检查要求每个 tooltip 接入统一 motion，避免新增组件又绕回另一套动画。Git CSS 源码 baseline 从 621 收紧至 615，没有上调门禁。

验收补充对应 AC-002/AC-004：真实 Chromium 的 48 组矩阵通过，包含实际参照组件、三主题、有/无 Web Block、减少动态效果与快速重新进入；打开/关闭期间宽高和材质不发生缩放变化，移出立即释放 DOM/原生裁剪。详细前后测量、脚本和图片见 evidence README。本轮没有重新打桌面安装包，上一轮安装包不包含本次前端动效更新。

本次最终验证：`$env:VITEST_MAX_WORKERS='4'; pnpm check` 通过（222 个测试文件通过、1 个跳过；1310 项测试通过、2 项跳过；21 项 Node 脚本测试、ESLint、TypeScript 和 Vite build 均通过）。首轮全量检查发现四处旧测试仍断言缩放/延迟卸载，已更新为公共动画与即时关闭后的重新进入、可访问描述行为，再次全量通过。源码体积门禁 0 reminders，`git diff --check` 与 qb change validate 通过；Vite 保留既有大 chunk 提示。
