import { Icon, type IconName } from "../components/Icon";
import { boundsStyle } from "./layoutPresentation";
import type { LayoutGeometry } from "./layoutGeometry";
import type { LayoutDrag } from "./useLayoutInteractions";
import type { LayoutLeaf } from "./model";

const labels: Record<LayoutLeaf["type"], { name: string; icon: IconName }> = {
  terminal: { name: "终端", icon: "terminal" }, files: { name: "文件", icon: "files" },
  network: { name: "网络", icon: "network" }, git: { name: "Git", icon: "git" }, web: { name: "网页", icon: "browser" },
};

export function LayoutDragOverlay({ drag, geometry }: { drag: LayoutDrag; geometry: LayoutGeometry }) {
  const target = geometry.leaves.find(leaf => leaf.node.blockId === drag.targetId);
  const source = geometry.leaves.find(leaf => leaf.node.blockId === drag.sourceId);
  const label = labels[source?.node.type ?? "terminal"];
  return <>
    {/* Full-workspace transition: the coordinator blocks guest input, paints a
        decoded preview, then covers native regions without hiding the controller. */}
    <div className="layout-drag-surface" data-app-overlay="transition" aria-hidden="true">
      {target && drag.position && <div className="layout-drop-target" data-drop-target={drag.targetId} style={boundsStyle(target.bounds)}>
        <div className={`drop-zone drop-${drag.position}`}/>
      </div>}
    </div>
    <div data-app-overlay="floating" data-overlay-motion="none" className="drag-ghost" style={{ transform: `translate3d(${drag.x + 12}px, ${drag.y + 12}px, 0)` }}><Icon name={label.icon}/>{label.name}</div>
  </>;
}
