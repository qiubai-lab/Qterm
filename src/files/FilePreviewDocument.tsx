import { lazy, Suspense, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { StatusBadge } from "../components/Button";
import { Icon } from "../components/Icon";
import type { FileEntry } from "../lib/tauri/files";
import type { PreviewKind } from "./fileBrowserModel";
import { FileSearchBar } from "./FileSearchBar";
import { useFileSearchSession } from "./useFileSearchSession";

type FileViewMode = "preview" | "edit";

export type FilePreviewState = {
  entry: FileEntry;
  kind: PreviewKind;
  mode: FileViewMode;
  loading: boolean;
  error: string;
  content: string;
  original: string;
  revision: string;
  imageUrl: string;
};

const CodeEditor = lazy(() => import("./CodeEditor").then((module) => ({ default: module.CodeEditor })));
const MarkdownPreview = lazy(() => import("./MarkdownPreview").then((module) => ({ default: module.MarkdownPreview })));

function FileLoadingState({ label }: { label: string }) {
  return <div className="file-loading-state" role="status" aria-live="polite">
    <span className="file-loading-popover"><span className="file-loading-spinner" aria-hidden="true"/><span>{label}</span></span>
  </div>;
}

export function FilePreviewDocument({ preview, displayPath, dirty, saving, operationMessage, onLeave, onEdit, onSave, onContentChange, onImageContextMenu }: {
  preview: FilePreviewState;
  displayPath: string;
  dirty: boolean;
  saving: boolean;
  operationMessage: string;
  onLeave: () => void;
  onEdit: () => void;
  onSave: () => void;
  onContentChange: (content: string) => void;
  onImageContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const documentRef = useRef<HTMLDivElement>(null);
  const [markdownText, setMarkdownText] = useState("");
  const isMarkdownPreview = preview.mode === "preview" && preview.kind === "markdown";
  const search = useFileSearchSession(isMarkdownPreview ? markdownText : preview.content);
  const searchAvailable = preview.kind !== "image" && !preview.loading && !preview.error;

  function focusDocument() {
    requestAnimationFrame(() => {
      const target = documentRef.current?.querySelector<HTMLElement>(".cm-content, .file-markdown-preview");
      target?.focus();
    });
  }

  function closeSearch() {
    search.closeSearch();
    focusDocument();
  }

  function openSearch() {
    search.openSearch();
    requestAnimationFrame(() => {
      const input = documentRef.current?.querySelector<HTMLInputElement>(".file-search input");
      input?.focus();
      input?.select();
    });
  }

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (!searchAvailable || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") return;
    event.preventDefault();
    event.stopPropagation();
    openSearch();
  }

  return <div ref={documentRef} className="file-preview-document" onKeyDownCapture={handleKeyDownCapture}>
    <header className="file-preview-toolbar">
      <button aria-label="返回文件夹" title="返回文件夹" onClick={onLeave}><Icon name="back" size={14}/></button>
      <div className="file-preview-identity"><strong>{preview.entry.name}{dirty && <span className="file-dirty-indicator" aria-label="有未保存的修改">*</span>}</strong><small title={displayPath}>{displayPath}</small></div>
      {preview.mode === "edit" && <StatusBadge tone="warning" presentation="tag" size="compact">实验功能</StatusBadge>}
      {preview.kind !== "image" && <button className="file-search-button" aria-label="搜索当前文件" aria-expanded={search.open} title="搜索当前文件（Ctrl/⌘+F）" disabled={!searchAvailable} onClick={openSearch}><Icon name="search" size={11}/></button>}
      <span className="file-view-mode">{preview.mode === "preview" ? "预览" : "编辑"}</span>
      {preview.mode === "preview" && <button className="file-edit-button" disabled={preview.kind === "image"} title={preview.kind === "image" ? "此文件类型不支持编辑" : "编辑文件（实验功能）"} onClick={onEdit}><Icon name="edit" size={11}/><span>编辑</span></button>}
      {preview.mode === "edit" && <button className="file-cancel-button" onClick={onLeave}><Icon name="close" size={10}/><span>取消</span></button>}
      {preview.mode === "edit" && <button className="file-save-button" aria-label={saving ? "正在保存" : dirty ? "保存" : "已保存"} aria-busy={saving || undefined} title={saving ? "正在保存" : dirty ? "保存文件" : "文件已保存"} disabled={!dirty || saving || preview.loading} onClick={onSave}><Icon name={dirty || saving ? "save" : "check"} size={11}/><span>保存</span></button>}
    </header>
    {search.open && <FileSearchBar query={search.query} activeIndex={search.activeIndex} resultCount={search.matches.length} truncated={search.truncated} onQueryChange={search.setQuery} onMove={search.move} onClose={closeSearch}/>}
    {preview.error && <div className="file-preview-message error" role="alert">{preview.error}</div>}
    <main className="file-preview-content">
      {preview.loading && <FileLoadingState label="正在读取文件…"/>}
      {!preview.loading && preview.kind === "image" && preview.imageUrl && <div className="file-image-preview" onContextMenu={onImageContextMenu}><img src={preview.imageUrl} alt={preview.entry.name}/></div>}
      {!preview.loading && isMarkdownPreview && <Suspense fallback={<FileLoadingState label="正在加载预览…"/>}><MarkdownPreview content={preview.content} searchMatches={search.matches} activeSearchIndex={search.activeIndex} onSearchTextChange={setMarkdownText}/></Suspense>}
      {!preview.loading && preview.kind !== "image" && (preview.mode === "edit" || preview.kind !== "markdown") && <Suspense fallback={<FileLoadingState label="正在加载文件…"/>}><CodeEditor value={preview.content} language={preview.kind} readOnly={preview.mode === "preview"} searchMatches={search.matches} activeSearchIndex={search.activeIndex} onChange={onContentChange} onSave={onSave}/></Suspense>}
    </main>
    {operationMessage && <div className="file-preview-operation" role="status" aria-label="图片操作状态" aria-live="polite">{operationMessage}</div>}
  </div>;
}
