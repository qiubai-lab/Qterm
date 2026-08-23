import { Button } from "../Button";
import { Icon } from "../Icon";

export function ConfigurationDirectorySetting({
  value,
  disabled,
  onChoose,
  onReset,
}: {
  value: string;
  disabled: boolean;
  onChoose: () => void;
  onReset: () => void;
}) {
  return <section className="settings-directory-card" role="group" aria-label="配置目录设置">
    <div className="settings-card-heading">
      <span><strong>Qterm 配置目录</strong><small>全部配置、设备状态与缓存的根目录</small></span>
      <span className="settings-directory-badge">重启后切换</span>
    </div>
    <div className="settings-directory-form">
      <label className="settings-directory-label" htmlFor="qterm-configuration-directory">Qterm 配置目录</label>
      <div className="settings-directory-control">
        <input
          id="qterm-configuration-directory"
          value={value}
          readOnly
          disabled={disabled}
          spellCheck={false}
        />
        <div className="settings-directory-actions" role="group" aria-label="配置目录操作">
          <Button disabled={disabled} aria-label="选择 Qterm 配置目录" onClick={onChoose}><Icon name="files" size={12}/>选择目录</Button>
          <Button disabled={disabled} aria-label="恢复默认 Qterm 配置目录" onClick={onReset}><Icon name="refresh" size={12}/>恢复默认</Button>
        </div>
      </div>
    </div>
  </section>;
}
