import { useRef, type ButtonHTMLAttributes } from "react";
import { Icon } from "../components/Icon";
import { isElementOverflowing, useThemedTooltip } from "../components/useThemedTooltip";

export function WebTabButton({ caption, loading, tooltipDisabled = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { caption: string; loading: boolean; tooltipDisabled?: boolean }) {
  const text = useRef<HTMLSpanElement>(null);
  const [anchor, description, hide, show, tooltip] = useThemedTooltip<HTMLButtonElement>({ tooltip: caption, disabled: tooltipDisabled, shouldShow: () => Boolean(text.current && isElementOverflowing(text.current)) });
  return <>
    <button {...props} ref={anchor} type="button" aria-describedby={description} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onKeyDown={event => { if (event.key === "Escape") hide(); props.onKeyDown?.(event); }}>
      {loading ? <span className="web-address-spinner"/> : <Icon name="browser" size={11}/>}
      <span ref={text}>{caption}</span>
    </button>
    {tooltip}
  </>;
}
