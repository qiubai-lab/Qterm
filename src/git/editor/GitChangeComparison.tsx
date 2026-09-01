import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { EditorLanguage } from "../../files/CodeEditor";

export function GitChangeComparison({ before, after, beforeLabel, afterLabel, language }: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  language: EditorLanguage;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const mergeView = new MergeView({
      a: { doc: before, extensions: comparisonExtensions(language, beforeLabel) },
      b: { doc: after, extensions: comparisonExtensions(language, afterLabel) },
      parent: host.current,
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
      diffConfig: { timeout: 250 },
    });
    return () => mergeView.destroy();
  }, [after, afterLabel, before, beforeLabel, language]);

  return <div ref={host} className="git-change-comparison file-code-editor" data-read-only aria-label="Git 更改差异"/>;
}

function comparisonExtensions(language: EditorLanguage, label: string): Extension {
  const languageExtension = language === "markdown" ? markdown()
    : language === "json" ? json()
    : language === "yaml" ? yaml()
    : [];
  return [
    basicSetup,
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-label": label }),
    languageExtension,
  ];
}
