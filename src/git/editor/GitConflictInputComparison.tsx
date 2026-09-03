import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { MergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import type { EditorLanguage } from "../../editor/editorLanguage";
import { useEditorLanguage } from "../../editor/useEditorLanguage";
import { CodeEditor } from "../../files/CodeEditor";
import type { GitConflictVersion } from "../../lib/tauri/git";

export function GitConflictInputComparison({ current, incoming, language }: {
  current: GitConflictVersion;
  incoming: GitConflictVersion;
  language: EditorLanguage;
}) {
  const host = useRef<HTMLDivElement>(null);
  const comparable = current.kind === "text" && incoming.kind === "text";
  const currentContent = current.content ?? "";
  const incomingContent = incoming.content ?? "";
  const languageSupport = useEditorLanguage(language);

  useEffect(() => {
    if (!comparable || !host.current) return;
    const mergeView = new MergeView({
      a: { doc: incomingContent, extensions: inputExtensions(languageSupport, "传入版本") },
      b: { doc: currentContent, extensions: inputExtensions(languageSupport, "当前版本") },
      parent: host.current,
      orientation: "a-b",
      highlightChanges: true,
      gutter: true,
      diffConfig: { timeout: 250 },
    });
    return () => mergeView.destroy();
  }, [comparable, currentContent, incomingContent, language, languageSupport]);

  if (comparable) return <div ref={host} className="git-conflict-comparison file-code-editor" data-read-only aria-label="冲突输入比较"/>;

  return <div className="git-conflict-input-fallback" aria-label="冲突输入比较">
    <VersionSurface label="传入版本" version={incoming} language={language}/>
    <VersionSurface label="当前版本" version={current} language={language}/>
  </div>;
}

function inputExtensions(languageSupport: Extension, label: string): Extension {
  return [
    basicSetup,
    EditorView.lineWrapping,
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.contentAttributes.of({ "aria-label": label }),
    languageSupport,
  ];
}

function VersionSurface({ label, version, language }: { label: string; version: GitConflictVersion; language: EditorLanguage }) {
  if (version.kind === "text") return <div className="git-conflict-fallback-pane"><CodeEditor value={version.content ?? ""} language={language} ariaLabel={label} readOnly onChange={() => undefined} onSave={() => undefined}/></div>;
  return <div className="git-conflict-fallback-pane git-conflict-version-state" role="status" aria-label={label}>
    <strong>{version.kind === "missing" ? "该版本不存在" : version.kind === "binary" ? "二进制版本" : "无法预览"}</strong>
    <span>{versionState(version)}</span>
  </div>;
}

function versionState(version: GitConflictVersion): string {
  if (version.kind === "missing") return "可以选择存在的一侧，或删除最终结果。";
  if (version.kind === "binary") return `${version.size} B · 不提供文本差异`;
  if (version.kind === "unsupported") return "需要使用外部工具检查该版本。";
  return `${version.size} B`;
}
