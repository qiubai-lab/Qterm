import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { json, jsonParseLinter } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { parseDocument } from "yaml";

export type EditorLanguage = "markdown" | "json" | "yaml" | "text";

export function CodeEditor({ value, language, readOnly = false, onChange, onSave }: {
  value: string;
  language: EditorLanguage;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialValue = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

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
          languageExtension,
          EditorView.updateListener.of((update) => {
            if (!readOnly && update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({ keydown(event) {
            if (!readOnly && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
              event.preventDefault();
              onSaveRef.current();
              return true;
            }
            return false;
          } }),
        ],
      }),
    });
    return () => view.destroy();
  }, [language, readOnly]);

  return <div className="file-code-editor" data-read-only={readOnly || undefined} ref={host}/>;
}
