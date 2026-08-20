import { DialogFrame } from "./DialogFrame";

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <DialogFrame title="帮助" subtitle="Workspace 使用指南" onClose={onClose}>
    <div className="help-list"><section><kbd>⌘T</kbd><div><strong>新建工作区</strong><p>每个顶部标签都是一个独立工作区。</p></div></section><section><kbd>⌘D</kbd><div><strong>分割终端</strong><p>按住 Shift 改为上下分割。</p></div></section><section><kbd>⌘1…9</kbd><div><strong>切换工作区</strong><p>直接跳到顶部指定的工作区。</p></div></section><section><kbd>⇧⌘[ ]</kbd><div><strong>循环切换</strong><p>在顶部工作区之间向前或向后切换。</p></div></section><section><kbd>拖动</kbd><div><strong>重排 Block</strong><p>拖动标题栏到另一个 Block 的边缘或中心。</p></div></section><section><kbd>⌘K</kbd><div><strong>连接管理</strong><p>从右侧连接图标为当前 Block 选择主机。</p></div></section></div>
  </DialogFrame>;
}
