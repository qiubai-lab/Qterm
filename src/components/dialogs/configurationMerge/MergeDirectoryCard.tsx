import { Button } from "../../Button";
import { Icon } from "../../Icon";

export function MergeDirectoryCard({ path, source = false, disabled, onChoose }: { path: string; source?: boolean; disabled?: boolean; onChoose?: () => void }) {
  const title = source ? "合并来源" : "当前配置目录";
  return <section className={`settings-directory-card configuration-merge-directory${source ? " is-source" : ""}`} aria-label={title}>
    <div className="settings-card-heading">
      <span><strong><Icon name={source ? "files" : "computer"} size={13}/>{title}</strong><small>{source ? "只读取来源目录；合并前可查看每项变更。" : "合并后的配置将保存到此目录"}</small></span>
      {!source && <span className="settings-directory-badge">当前使用</span>}
    </div>
    <div className="settings-directory-form"><div className="settings-directory-control">
      <input aria-label={source ? "来源配置目录" : title} readOnly disabled={!source || disabled} value={path} placeholder={source ? "请选择来源 Qterm 配置目录" : undefined} spellCheck={false}/>
      {source && <div className="settings-directory-actions"><Button disabled={disabled} aria-label="选择来源配置目录" onClick={onChoose}><Icon name="files" size={12}/>选择目录</Button></div>}
    </div></div>
  </section>;
}
