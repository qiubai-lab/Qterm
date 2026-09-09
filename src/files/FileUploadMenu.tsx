import { createPortal } from "react-dom";
import type { FocusEventHandler, KeyboardEventHandler, PointerEventHandler, RefObject } from "react";

import { Icon } from "../components/Icon";

interface FileUploadMenuProps {
  menuRef: RefObject<HTMLDivElement | null>;
  position: { x: number; y: number; placement: "above" | "below" };
  onPointerDownCapture: PointerEventHandler<HTMLDivElement>;
  onBlur: FocusEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onSelect: (selection: "files" | "folder") => void;
}

/** Keeps the viewport-positioned upload menu outside transformed workspace surfaces. */
export function FileUploadMenu({ menuRef, position, onPointerDownCapture, onBlur, onKeyDown, onSelect }: FileUploadMenuProps) {
  return createPortal(<div
    ref={menuRef}
    className="file-context-menu file-upload-menu"
    data-placement={position.placement}
    role="menu"
    aria-label="选择上传内容"
    style={{ left: position.x, top: position.y }}
    onPointerDownCapture={onPointerDownCapture}
    onBlur={onBlur}
    onKeyDown={onKeyDown}
    onContextMenu={(event) => event.preventDefault()}
  >
    <button type="button" role="menuitem" onClick={() => onSelect("files")}><Icon name="file" size={13}/><span>上传文件…</span></button>
    <button type="button" role="menuitem" onClick={() => onSelect("folder")}><Icon name="files" size={13}/><span>上传文件夹…</span></button>
  </div>, document.body);
}
