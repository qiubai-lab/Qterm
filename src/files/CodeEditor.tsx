import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { basicSetup } from "codemirror";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { jsonParseLinter } from "@codemirror/lang-json";
import { linter } from "@codemirror/lint";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, type Command } from "@codemirror/view";
import { readText as readClipboardText, writeText as writeClipboardText } from "@tauri-apps/plugin-clipboard-manager";
import { parseDocument } from "yaml";

import { plainTextLanguageSupport, type EditorLanguage } from "../editor/editorLanguage";
import { useEditorLanguage } from "../editor/useEditorLanguage";
import { FileTextContextMenu } from "./FileTextContextMenu";
import { fileTextShortcutLabels } from "./fileTextContextMenuModel";

export type { EditorLanguage } from "../editor/editorLanguage";
type EditorContextMenuState = { x: number; y: number; hasSelection: boolean; hasContent: boolean; canUndo: boolean; canRedo: boolean; focusOnOpen: boolean };
type EditorOperationMessage = { text: string; tone: "success" | "error" };

const SUCCESS_OPERATION_MESSAGE_MS = 1_800;
const ERROR_OPERATION_MESSAGE_MS = 4_200;
const EMPTY_EXTENSIONS: Extension = [];

export function CodeEditor({ value, language, readOnly = false, ariaLabel, extensions = EMPTY_EXTENSIONS, onViewReady, onChange, onSave }: {
  value: string;
  language: EditorLanguage;
  readOnly?: boolean;
  ariaLabel?: string;
  extensions?: Extension;
  onViewReady?: (view: EditorView | null) => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onViewReadyRef = useRef(onViewReady);
  const extensionsRef = useRef(extensions);
  const featureExtensions = useRef(new Compartment());
  const languageExtensions = useRef(new Compartment());
  const [contextMenu, setContextMenu] = useState<EditorContextMenuState | null>(null);
  const [operationMessage, setOperationMessage] = useState<EditorOperationMessage | null>(null);
  const languageSupport = useEditorLanguage(language);
  const syntaxExtensions = useMemo<Extension>(() => [
    languageSupport,
    language === "json" ? linter(jsonParseLinter()) : [],
    language === "yaml" ? linter((view) => {
      const document = parseDocument(view.state.doc.toString());
      return document.errors.map((error) => ({ from: 0, to: Math.min(1, view.state.doc.length), severity: "error" as const, message: error.message }));
    }) : [],
  ], [language, languageSupport]);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
    onViewReadyRef.current = onViewReady;
    extensionsRef.current = extensions;
  }, [extensions, onChange, onSave, onViewReady]);

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
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          ariaLabel ? EditorView.contentAttributes.of({ "aria-label": ariaLabel }) : [],
          EditorView.editorAttributes.of((editorView) => (
            editorView.state.selection.ranges.some((range) => !range.empty) ? { class: "cm-has-selection" } : null
          )),
          languageExtensions.current.of(plainTextLanguageSupport),
          featureExtensions.current.of(extensionsRef.current),
          EditorView.updateListener.of((update) => {
            if (!readOnly && update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            keydown(event, editorView) {
              if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                onSaveRef.current();
                return true;
              }
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                const rect = editorView.dom.getBoundingClientRect();
                setContextMenu(readEditorContextMenuState(editorView, rect.left + 38, rect.top + 24, true));
                return true;
              }
              return false;
            },
          }),
        ],
      }),
    });
    editor.current = view;
    onViewReadyRef.current?.(view);
    return () => {
      onViewReadyRef.current?.(null);
      editor.current = null;
      view.destroy();
    };
  }, [ariaLabel, readOnly]);

  useEffect(() => {
    editor.current?.dispatch({ effects: languageExtensions.current.reconfigure(syntaxExtensions) });
  }, [syntaxExtensions]);

  useEffect(() => {
    editor.current?.dispatch({ effects: featureExtensions.current.reconfigure(extensions) });
  }, [extensions]);

  function closeMenu(restoreFocus: boolean) {
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
    view.focus();
  }

  function runHistory(command: Command) {
    const view = editor.current;
    if (!view) return;
    command(view);
    view.focus();
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const view = editor.current;
    if (!view) return;
    view.focus();
    setContextMenu(readEditorContextMenuState(view, event.clientX, event.clientY, false));
  }

  const shortcuts = fileTextShortcutLabels();
  return <div className="file-code-editor" data-read-only={readOnly || undefined} onContextMenu={handleContextMenu}>
    <div className="file-code-editor-host" ref={host}/>
    {operationMessage && <div className="file-editor-operation" data-tone={operationMessage.tone} role="status" aria-label="编辑器操作状态" aria-live="polite">{operationMessage.text}</div>}
    {contextMenu && <FileTextContextMenu
      anchor={contextMenu}
      label={readOnly ? "文件预览菜单" : "文件编辑菜单"}
      className="file-editor-context-menu"
      focusOnOpen={contextMenu.focusOnOpen}
      onDismiss={closeMenu}
      groups={readOnly ? [
        [{ label: "复制", shortcut: shortcuts.copy, disabled: !contextMenu.hasSelection, onSelect: () => void copySelection(false) }],
        [{ label: "全选", shortcut: shortcuts.selectAll, disabled: !contextMenu.hasContent, onSelect: selectAll }],
      ] : [
        [
          { label: "撤销", shortcut: shortcuts.undo, disabled: !contextMenu.canUndo, onSelect: () => runHistory(undo) },
          { label: "重做", shortcut: shortcuts.redo, disabled: !contextMenu.canRedo, onSelect: () => runHistory(redo) },
        ],
        [
          { label: "剪切", shortcut: shortcuts.cut, disabled: !contextMenu.hasSelection, onSelect: () => void copySelection(true) },
          { label: "复制", shortcut: shortcuts.copy, disabled: !contextMenu.hasSelection, onSelect: () => void copySelection(false) },
          { label: "粘贴", shortcut: shortcuts.paste, onSelect: () => void pasteSelection() },
        ],
        [{ label: "全选", shortcut: shortcuts.selectAll, disabled: !contextMenu.hasContent, onSelect: selectAll }],
      ]}
    />}
  </div>;
}

function clipboardErrorMessage(reason: unknown) {
  return reason instanceof Error && reason.message.trim() ? reason.message : "剪贴板不可用";
}

function readEditorContextMenuState(view: EditorView, x: number, y: number, focusOnOpen: boolean): EditorContextMenuState {
  return {
    x,
    y,
    hasSelection: view.state.selection.ranges.some((range) => !range.empty),
    hasContent: view.state.doc.length > 0,
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
    focusOnOpen,
  };
}
