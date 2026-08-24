import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { readText as readClipboardText, writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { parseDocument } from "yaml";

import { fitContextMenu } from "./fileBrowserModel";

export type EditorLanguage = "markdown" | "json" | "yaml" | "text";
type EditorContextMenuState = { anchorX: number; anchorY: number; x: number; y: number; placement: "above" | "below"; hasSelection: boolean; hasContent: boolean };
type EditorOperationMessage = { text: string; tone: "success" | "error" };

const SUCCESS_OPERATION_MESSAGE_MS = 1_800;
const ERROR_OPERATION_MESSAGE_MS = 4_200;

export function CodeEditor({ value, language, readOnly = false, onChange, onSave }: {
  value: string;
  language: EditorLanguage;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const [operationMessage, setOperationMessage] = useState<EditorOperationMessage | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    if (!operationMessage) return;
    const duration = operationMessage.tone === "error" ? ERROR_OPERATION_MESSAGE_MS : SUCCESS_OPERATION_MESSAGE_MS;
    const timeout = window.setTimeout(() => {
      setOperationMessage((current) => current === operationMessage ? null : current);
    }, duration);
    return () => window.clearTimeout(timeout);
  }, [operationMessage]);

  useEffect(() => {
    if (!host.current) return;
    const languageExtension = language === "markdown" ? markdown()
      : language === "json" ? [json(), linter(jsonParseLinter())]
      : language === "yaml" ? [yaml(), linter((view) => {
        const document = parseDocument(view.state.doc.toString());
        return document.errors.map((error) => ({ from: 0, to: Math.min(1, view.state.doc.length), severity: "error" as const, message: error.message }));
      })]
      : [];
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.editorAttributes.of((editorView) => (
            editorView.state.selection.ranges.some((range) => !range.empty) ? { class: "cm-has-selection" } : null
          )),
          languageExtension,
          EditorView.updateListener.of((update) => {
            if (!readOnly && update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            contextmenu(event, editorView) {
              event.preventDefault();
              editorView.focus();
              const anchorX = event.clientX;
              const anchorY = event.clientY;
              setContextMenu({ anchorX, anchorY, x: anchorX, y: anchorY, placement: "below", hasSelection: editorView.state.selection.ranges.some((range) => !range.empty), hasContent: editorView.state.doc.length > 0 });
              return true;
            },
            keydown(event, editorView) {
              if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                onSaveRef.current();
                return true;
              }
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                const rect = editorView.dom.getBoundingClientRect();
                const anchorX = rect.left + 38;
                const anchorY = rect.top + 24;
                setContextMenu({ anchorX, anchorY, x: anchorX, y: anchorY, placement: "below", hasSelection: editorView.state.selection.ranges.some((range) => !range.empty), hasContent: editorView.state.doc.length > 0 });
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => { editor.current = null; view.destroy(); };
  }, [language, readOnly]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".file-editor-context-menu")) setContextMenu(null);
    };
    const closeOnKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setContextMenu(null);
      editor.current?.focus();
    };
    const closeWithoutFocus = () => setContextMenu(null);
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnKeyDown);
    window.addEventListener("resize", closeWithoutFocus);
    window.addEventListener("scroll", closeWithoutFocus, true);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']:not(:disabled)")?.focus(), 0);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnKeyDown);
      window.removeEventListener("resize", closeWithoutFocus);
      window.removeEventListener("scroll", closeWithoutFocus, true);
    };
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const fitted = fitContextMenu(contextMenu.anchorX, contextMenu.anchorY, menuRef.current.offsetWidth, menuRef.current.offsetHeight, window.innerWidth, window.innerHeight);
    if (fitted.x === contextMenu.x && fitted.y === contextMenu.y && fitted.placement === contextMenu.placement) return;
    setContextMenu((current) => current ? { ...current, ...fitted } : null);
  }, [contextMenu]);

  function closeMenu(restoreFocus = true) {
    setContextMenu(null);
    if (restoreFocus) requestAnimationFrame(() => editor.current?.focus());
  }

  function selectedText(view: EditorView) {
    return view.state.selection.ranges
      .filter((range) => !range.empty)
      .map((range) => view.state.sliceDoc(range.from, range.to))
      .join("\n");
  }

  async function copySelection(cut: boolean) {
    const view = editor.current;
    if (!view) return;
    const text = selectedText(view);
    closeMenu(false);
    if (!text) { view.focus(); return; }
    try {
      await writeClipboardText(text);
      if (editor.current !== view) return;
      if (cut && !readOnly) {
        const changes = view.state.selection.ranges.filter((range) => !range.empty).map((range) => ({ from: range.from, to: range.to, insert: "" }));
        if (changes.length > 0) view.dispatch({ changes });
      }
      setOperationMessage({ text: cut ? "已剪切" : "已复制", tone: "success" });
    } catch (reason) {
      if (editor.current === view) setOperationMessage({ text: `${cut ? "剪切" : "复制"}失败：${clipboardErrorMessage(reason)}`, tone: "error" });
    } finally {
      if (editor.current === view) view.focus();
    }
  }

  async function pasteSelection() {
    const view = editor.current;
    if (!view || readOnly) return;
    closeMenu(false);
    try {
      const text = await readClipboardText();
      if (editor.current !== view) return;
      const changes = view.state.selection.ranges.map((range) => ({ from: range.from, to: range.to, insert: text }));
      view.dispatch({ changes });
      setOperationMessage({ text: "已粘贴", tone: "success" });
    } catch (reason) {
      if (editor.current === view) setOperationMessage({ text: `粘贴失败：${clipboardErrorMessage(reason)}`, tone: "error" });
    } finally {
      if (editor.current === view) view.focus();
    }
  }

  function selectAll() {
    const view = editor.current;
    if (!view) return;
    view.dispatch({ selection: { anchor: 0, head: view.state.doc.length }, scrollIntoView: true });
    closeMenu();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='menuitem']:not(:disabled)"));
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      items[(index + offset + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  const shortcuts = editorShortcutLabels();
  return <div className="file-code-editor" data-read-only={readOnly || undefined}>
    <div className="file-code-editor-host" ref={host}/>
    {operationMessage && <div className="file-editor-operation" data-tone={operationMessage.tone} role="status" aria-label="编辑器操作状态" aria-live="polite">{operationMessage.text}</div>}
    {contextMenu && createPortal(<div ref={menuRef} className="file-context-menu file-editor-context-menu" data-placement={contextMenu.placement} role="menu" aria-label={readOnly ? "文件预览菜单" : "文件编辑菜单"} style={{ left: contextMenu.x, top: contextMenu.y }} onContextMenu={(event) => event.preventDefault()} onKeyDown={handleMenuKeyDown}>
      {!readOnly && <button role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void copySelection(true)}><span>剪切</span><kbd>{shortcuts.cut}</kbd></button>}
      <button role="menuitem" disabled={!contextMenu.hasSelection} onClick={() => void copySelection(false)}><span>复制</span><kbd>{shortcuts.copy}</kbd></button>
      {!readOnly && <button role="menuitem" onClick={() => void pasteSelection()}><span>粘贴</span><kbd>{shortcuts.paste}</kbd></button>}
      <div className="file-context-menu-separator" role="separator"/>
      <button role="menuitem" disabled={!contextMenu.hasContent} onClick={selectAll}><span>全选</span><kbd>{shortcuts.selectAll}</kbd></button>
    </div>, document.body)}
  </div>;
}

function clipboardErrorMessage(reason: unknown) {
  return reason instanceof Error && reason.message.trim() ? reason.message : "剪贴板不可用";
}

function editorShortcutLabels() {
  const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  const modifier = platform.includes("mac") ? "⌘" : "Ctrl+";
  return { cut: `${modifier}X`, copy: `${modifier}C`, paste: `${modifier}V`, selectAll: `${modifier}A` };
}
