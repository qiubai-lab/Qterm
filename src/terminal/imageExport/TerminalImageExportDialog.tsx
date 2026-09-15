import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/Button";
import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { Icon } from "../../components/Icon";
import { TerminalImagePreview } from "./TerminalImagePreview";
import { imageStyles, imageThemes } from "./terminalImageModel";
import { TerminalImageFeedbackBubble } from "./TerminalImageFeedbackBubble";
import type { TerminalImageRequest } from "./useTerminalImageExport";
import { useTerminalImagePreview } from "./useTerminalImagePreview";

export function TerminalImageExportDialog({ request, onClose }: { request: TerminalImageRequest; onClose: () => void }) {
  const [style, setStyle] = useState(request.style);
  const [theme, setTheme] = useState(request.theme);
  const preview = useTerminalImagePreview(request.snapshot, style, theme);
  const error = request.error || preview.renderError;
  const busy = preview.operation !== null;
  return createPortal(<DialogFrame wide className="terminal-image-dialog" title="导出终端图片" subtitle={request.snapshot ? `${request.snapshot.lines.length} 行 · 保留原终端宽度` : "请选择需要导出的终端行"} onClose={onClose} headerActions={
    <div className="terminal-image-styles" role="group" aria-label="图片样式" style={{ "--choice-index": imageStyles.findIndex(item => item.id === style) } as CSSProperties}>
      {imageStyles.map(item => <button key={item.id} type="button" aria-pressed={style === item.id} disabled={busy} onClick={() => { preview.clearFeedback(); setStyle(item.id); }}>
        <span className="terminal-image-style-symbol" data-style={item.id} aria-hidden="true"><i/><i/><i/></span>
        {item.label}
      </button>)}
    </div>
  }>
    <div className="terminal-image-workbench">
      <aside className="terminal-image-theme-sidebar">
        <span className="terminal-image-section-label">主题</span>
        <div className="terminal-image-themes" role="group" aria-label="图片主题" style={{ "--choice-index": imageThemes.findIndex(item => item.id === theme) } as CSSProperties}>
          {imageThemes.map(item => <button key={item.id} type="button" aria-pressed={theme === item.id} disabled={busy} onClick={() => { preview.clearFeedback(); setTheme(item.id); }}>
            <span className="terminal-image-theme-swatch" data-terminal-image-theme={item.id} aria-hidden="true"><span>❯ <i>_</i></span><b/></span>
            <span>{item.label}</span>
          </button>)}
        </div>
      </aside>
      <TerminalImagePreview image={preview.displayImage} error={error} pending={preview.pending} snapshot={request.snapshot} style={style} theme={theme}/>
    </div>
    <footer className="terminal-image-footer">
      <div className="terminal-image-action" data-action="save">
        <Button size="compact" disabled={!preview.image || busy} loading={preview.operation === "save"} onClick={() => void preview.run("save")}><span className="terminal-image-action-icon" data-loading={preview.operation === "save"}><Icon name="download" size={13}/><i className="terminal-image-spinner" aria-hidden="true"/></span>{preview.operation === "save" ? "正在保存…" : "保存 PNG"}</Button>
        {preview.feedback?.action === "save" && <TerminalImageFeedbackBubble key={preview.feedback.id} feedback={preview.feedback}/>}
      </div>
      <div className="terminal-image-action" data-action="copy">
        <Button size="compact" variant="primary" disabled={!preview.image || busy} loading={preview.operation === "copy"} onClick={() => void preview.run("copy")}><span className="terminal-image-action-icon" data-loading={preview.operation === "copy"}><Icon name="copy" size={13}/><i className="terminal-image-spinner" aria-hidden="true"/></span>{preview.operation === "copy" ? "正在复制…" : "复制图片"}</Button>
        {preview.feedback?.action === "copy" && <TerminalImageFeedbackBubble key={preview.feedback.id} feedback={preview.feedback}/>}
      </div>
    </footer>
  </DialogFrame>, document.body);
}
