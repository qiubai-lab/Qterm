import { createPortal } from "react-dom";

import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/dialogs/DialogFrame";

export function TerminalCwdDialog({ local, targetName, fallbackPath, onClose, onOpenFallback }: {
  local: boolean;
  targetName: string;
  fallbackPath: string;
  onClose: () => void;
  onOpenFallback: (path: string) => void;
}) {
  return createPortal(
    <DialogFrame compact className="terminal-cwd-dialog" title="未检测到终端当前目录" subtitle={targetName} onClose={onClose}>
      <div className="terminal-cwd-body">
        <div className="terminal-cwd-intro">
          <span aria-hidden="true"><Icon name="terminal" size={17}/></span>
          <p>当前终端尚未上报可用工作目录。你可以暂时从{local ? "启动目录" : "远程主目录"}打开；收到 OSC 7 目录信息后，文件夹按钮会直接打开终端所在路径。</p>
        </div>
        <p className="terminal-cwd-fallback">回退位置：<code>{fallbackPath}</code></p>
      </div>
      <footer className="dialog-actions terminal-cwd-footer">
        <Button variant="primary" onClick={() => onOpenFallback(fallbackPath)}>{local ? "从启动目录打开" : "从远程主目录打开"}</Button>
      </footer>
    </DialogFrame>,
    document.body,
  );
}
