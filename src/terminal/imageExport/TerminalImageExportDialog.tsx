import { useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { TerminalImageSizePicker } from "./TerminalImageSizePicker";
import { defaultImageScale } from "./terminalImageSizes";
import { TerminalImageActionButton } from "./TerminalImageActionButton";
import { DialogFrame } from "../../components/dialogs/DialogFrame";
import { TerminalImagePreview } from "./TerminalImagePreview";
import { imageStyles, imageThemes } from "./terminalImageModel";
import { TerminalImageFeedbackBubble } from "./TerminalImageFeedbackBubble";
import type { TerminalImageRequest } from "./useTerminalImageExport";
import { useTerminalImagePreview } from "./useTerminalImagePreview";

export function TerminalImageExportDialog({ request, onClose }: { request: TerminalImageRequest; onClose: () => void }) {
  const [style, setStyle] = useState(request.style);
  const [theme, setTheme] = useState(request.theme);
  const [scale, setScale] = useState(() => defaultImageScale(request.snapshot));
  const preview = useTerminalImagePreview(request.snapshot, style, theme, scale);
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
      <TerminalImageSizePicker snapshot={request.snapshot} scale={scale} busy={busy} onChange={value => { preview.clearFeedback(); setScale(value); }}/>
      <div className="terminal-image-action" data-action="save">
        <TerminalImageActionButton action="save" available={!!preview.image} refreshing={preview.pending && !!preview.displayImage} operation={preview.operation} feedback={preview.feedback} onClick={() => void preview.run("save")}/>
        {preview.feedback?.action === "save" && <TerminalImageFeedbackBubble key={preview.feedback.id} feedback={preview.feedback}/>}
      </div>
      <div className="terminal-image-action" data-action="copy">
        <TerminalImageActionButton action="copy" available={!!preview.image} refreshing={preview.pending && !!preview.displayImage} operation={preview.operation} feedback={preview.feedback} onClick={() => void preview.run("copy")}/>
        {preview.feedback?.action === "copy" && <TerminalImageFeedbackBubble key={preview.feedback.id} feedback={preview.feedback}/>}
      </div>
    </footer>
  </DialogFrame>, document.body);
}
