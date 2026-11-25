import { Button, IconButton } from "../Button";
import { Icon } from "../Icon";
import { DEFAULT_TERMINAL_FONT_SIZE, MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE, validTerminalFontSize } from "../../terminal/terminalFontSize";

export function TerminalFontSizeSetting({ value, onChange, disabled }: {
  value: string; onChange: (next: string) => void; disabled: boolean;
}) {
  const size = Number(value);
  const valid = validTerminalFontSize(size);
  const previewSize = valid ? size : DEFAULT_TERMINAL_FONT_SIZE;
  return <section className="settings-terminal-font" aria-labelledby="terminal-font-label">
    <div className="settings-font-toolbar">
      <div className="settings-font-label">
        <label id="terminal-font-label" htmlFor="terminal-font-size">终端字号</label>
        <small id="terminal-font-range" data-invalid={!valid || undefined}>
          {valid ? `${MIN_TERMINAL_FONT_SIZE}–${MAX_TERMINAL_FONT_SIZE} px` : "请输入 10–32 之间的整数"}
        </small>
      </div>
      <div className="settings-font-actions">
        <div className="settings-font-stepper">
          <IconButton label="减小终端字号" disabled={disabled || previewSize <= MIN_TERMINAL_FONT_SIZE}
            onClick={() => onChange(String(previewSize - 1))}><Icon name="windowMinimize" size={13}/></IconButton>
          <div className="settings-font-value">
            <input id="terminal-font-size" type="number" min={MIN_TERMINAL_FONT_SIZE} max={MAX_TERMINAL_FONT_SIZE} step={1}
              value={value} disabled={disabled} aria-invalid={!valid} aria-describedby="terminal-font-range"
              onChange={event => onChange(event.target.value)}/>
            <span aria-hidden="true">px</span>
          </div>
          <IconButton label="增大终端字号" disabled={disabled || previewSize >= MAX_TERMINAL_FONT_SIZE}
            onClick={() => onChange(String(previewSize + 1))}><Icon name="plus" size={13}/></IconButton>
        </div>
        <Button size="compact" variant="quiet" aria-label="恢复默认终端字号" disabled={disabled || size === DEFAULT_TERMINAL_FONT_SIZE}
          onClick={() => onChange(String(DEFAULT_TERMINAL_FONT_SIZE))}><Icon name="refresh" size={12}/>恢复默认</Button>
      </div>
    </div>
    <figure className="settings-font-preview" aria-labelledby="terminal-font-preview-label">
      <figcaption id="terminal-font-preview-label"><Icon name="terminal" size={12}/>终端预览</figcaption>
      <samp style={{ fontSize: previewSize }}>
        <span className="settings-preview-command"><b>~</b> <em>$</em> echo "你好，Qterm"</span>
        <span>你好，Qterm</span>
      </samp>
    </figure>
  </section>;
}
