import { Icon } from "../components/Icon";
import { useThemedTooltip } from "../components/useThemedTooltip";

/** Visible compatibility help remains outside the native page bounds. */
export function WebTunnelNotice() {
  const [anchor, descriptionId, hide, show, tooltip] = useThemedTooltip<HTMLButtonElement>({
    tooltip: "远程 localhost 使用专用隧道域名。HTTPS localhost、依赖原始域名的登录回跳和 Cookie，以及部分硬编码地址可能无法使用。",
  });
  return <>
    <button type="button" ref={anchor} aria-label="隧道域名兼容性" aria-describedby={descriptionId}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={show}
      onKeyDown={event => { if (event.key === "Escape") hide(); }}><Icon name="help" size={13}/></button>
    {tooltip}
  </>;
}
