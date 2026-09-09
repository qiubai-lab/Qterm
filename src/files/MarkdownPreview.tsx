import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";

import { isExternalHttpUrl, openExternalHttpUrl } from "../lib/externalUrl";
import { FileTextContextMenu } from "./FileTextContextMenu";
import { fileTextShortcutLabels, selectAllTextWithin, selectedTextWithin } from "./fileTextContextMenuModel";
import type { FileSearchMatch } from "./fileSearchModel";
import { markdownSearchPlugin, markdownSearchText } from "./markdownPreviewSearch";

type MarkdownContextMenuState = { x: number; y: number; selectedText: string; linkHref: string | null; focusOnOpen: boolean };

export function MarkdownPreview({ content, searchMatches = [], activeSearchIndex = -1, onSearchTextChange }: {
  content: string;
  searchMatches?: FileSearchMatch[];
  activeSearchIndex?: number;
  onSearchTextChange?: (text: string) => void;
}) {
  const previewRef = useRef<HTMLElement>(null);
  const invokerRef = useRef<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<MarkdownContextMenuState | null>(null);
  const shortcuts = fileTextShortcutLabels();
  const searchPlugin = useMemo(() => markdownSearchPlugin(searchMatches, activeSearchIndex), [activeSearchIndex, searchMatches]);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (preview) onSearchTextChange?.(markdownSearchText(preview));
  }, [content, onSearchTextChange]);

  useLayoutEffect(() => {
    const active = previewRef.current?.querySelector<HTMLElement>(".file-search-match-active");
    active?.scrollIntoView?.({ block: "center", inline: "nearest" });
  }, [activeSearchIndex, searchMatches]);

  function openMenu(x: number, y: number, target: EventTarget | null, focusOnOpen: boolean) {
    const preview = previewRef.current;
    if (!preview) return;
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
    const href = link && preview.contains(link) && isExternalHttpUrl(link.getAttribute("href") ?? undefined) ? link.getAttribute("href") : null;
    invokerRef.current = document.activeElement instanceof HTMLElement && preview.contains(document.activeElement) ? document.activeElement : preview;
    setContextMenu({ x, y, selectedText: selectedTextWithin(preview), linkHref: href, focusOnOpen });
  }

  function handleContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault();
    openMenu(event.clientX, event.clientY, event.target, false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target : previewRef.current;
    const rect = target?.getBoundingClientRect();
    openMenu((rect?.left ?? 0) + 24, (rect?.top ?? 0) + 22, target, true);
  }

  function closeMenu(restoreFocus: boolean) {
    setContextMenu(null);
    if (restoreFocus) requestAnimationFrame(() => invokerRef.current?.focus());
  }

  function copyText(text: string) {
    void writeClipboardText(text).catch(() => undefined);
  }

  return <article ref={previewRef} className="file-markdown-preview" tabIndex={0} aria-label="Markdown 文件预览" onContextMenu={handleContextMenu} onKeyDown={handleKeyDown}>
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[searchPlugin]} components={{
      a: ({ children, href, title }) => isExternalHttpUrl(href)
        ? <a href={href} title={title} target="_blank" rel="noreferrer" onClick={(event) => {
          event.preventDefault();
          void openExternalHttpUrl(href).catch(() => undefined);
        }}>{children}</a>
        : <span className="markdown-disabled-link" title={href}>{children}</span>,
      img: ({ alt }) => <span className="markdown-blocked-image">[图片已禁用：{alt ?? "无描述"}]</span>,
    }}>{content}</Markdown>
    {contextMenu && <FileTextContextMenu
      anchor={contextMenu}
      label="Markdown 预览菜单"
      focusOnOpen={contextMenu.focusOnOpen}
      onDismiss={closeMenu}
      groups={[
        contextMenu.linkHref ? [{ label: "复制链接地址", onSelect: () => copyText(contextMenu.linkHref!) }] : [],
        [{ label: "复制", shortcut: shortcuts.copy, disabled: !contextMenu.selectedText, onSelect: () => copyText(contextMenu.selectedText) }],
        [{ label: "全选", shortcut: shortcuts.selectAll, disabled: !content, onSelect: () => { if (previewRef.current) selectAllTextWithin(previewRef.current); } }],
      ]}
    />}
  </article>;
}
