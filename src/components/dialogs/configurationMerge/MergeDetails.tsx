import { isElementOverflowing, useThemedTooltip } from "../../useThemedTooltip";
import { OverlayScrollArea } from "../../scrollbars/OverlayScrollArea";
import type { MergeDetail, MergePreview } from "../../../lib/tauri/configurationMerge";

const categories = { connections: "连接", groups: "分组", network: "规则", credentials: "凭证" };
const outcomes = { added: "新增", skipped: "复用", renamed: "重命名", invalid: "失效跳过" };

export function MergeDetails({ preview, done = false }: { preview: MergePreview; done?: boolean }) {
  const details = [...preview.details].sort((a, b) => Number(b.outcome === "invalid") - Number(a.outcome === "invalid"));
  const invalid = details.filter((d) => d.outcome === "invalid").length;
  const reused = details.filter((d) => d.outcome === "skipped").length;
  const added = details.length - invalid - reused;
  return <section className="configuration-merge-details" aria-label="变更详情">
      <div className="configuration-merge-details-heading"><div><h3>{done ? "合并明细" : "变更明细"}</h3><p>{done ? "已完成导入，原有配置保持不变" : "确认即将写入当前目录的配置"}</p></div><div className="configuration-merge-summary" aria-label={`新增 ${added} · 复用 ${reused} · 失效跳过 ${invalid}`}><span>新增 <b>{added}</b></span><span>复用 <b>{reused}</b></span><span data-warning={invalid > 0}>跳过 <b>{invalid}</b></span></div></div>
      <OverlayScrollArea className="configuration-merge-detail-list" viewportClassName="configuration-merge-detail-viewport" viewportProps={{ tabIndex: 0, "aria-label": "变更列表" }}>
        {details.length === 0 && <p className="configuration-merge-empty" role="status">所选配置已存在或为空，无需合并。</p>}
        {details.map((detail, i) => <MergeDetailRow detail={detail} done={done} key={i}/>)}
      </OverlayScrollArea>
    </section>;
}

function MergeDetailRow({ detail: d, done }: { detail: MergeDetail; done: boolean }) {
  const name = d.targetName !== d.name ? `${d.name} → ${d.targetName}` : d.name;
  const note = d.note || (d.outcome === "skipped" ? "与当前配置一致，保留已有配置" : done ? "已合并到当前配置目录" : "合并到当前配置目录");
  const visibleNote = note.replace(/（ID[：:][^）]*）/g, "");
  const [ref, descriptionId, hide, show, tooltip] = useThemedTooltip<HTMLDivElement>({
    tooltip: `${name} · ${note}`,
    shouldShow: (element) => visibleNote !== note || Array.from(element.querySelectorAll<HTMLElement>("strong, small")).some(isElementOverflowing),
  });
  return <><div ref={ref} tabIndex={0} aria-describedby={descriptionId} className="configuration-merge-detail" data-outcome={d.outcome}
    onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
    <span className="configuration-merge-detail-kind">{categories[d.category]}</span>
    <div><strong>{name}</strong><small>{visibleNote}</small></div>
    <span className="configuration-merge-outcome" data-outcome={d.outcome}>{outcomes[d.outcome]}</span>
  </div>{tooltip}</>;
}
