import { StreamLanguage } from "@codemirror/language";
import type { Extension } from "@codemirror/state";

import { editorSyntaxHighlighting } from "./editorHighlightStyle";

export type EditorLanguage =
  | "text"
  | "markdown"
  | "json"
  | "yaml"
  | "javascript"
  | "jsx"
  | "typescript"
  | "tsx"
  | "html"
  | "css"
  | "scss"
  | "sass"
  | "less"
  | "python"
  | "rust"
  | "go"
  | "java"
  | "cpp"
  | "sql"
  | "shell"
  | "dockerfile";

type ParsedEditorLanguage = Exclude<EditorLanguage, "text">;
type LanguageModuleLoader = () => Promise<Extension>;
type LanguageModuleLoaders = Partial<Record<ParsedEditorLanguage, LanguageModuleLoader>>;

export const plainTextLanguageSupport: Extension = [];

const extensions: Readonly<Record<string, EditorLanguage>> = {
  md: "markdown",
  markdown: "markdown",
  mdown: "markdown",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  py: "python",
  pyw: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "cpp",
  h: "cpp",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
};

const specialNames: Readonly<Record<string, EditorLanguage>> = {
  dockerfile: "dockerfile",
  ".bashrc": "shell",
  ".bash_profile": "shell",
  ".profile": "shell",
  ".zshrc": "shell",
  ".zprofile": "shell",
};

export function editorLanguageForFileName(path: string): EditorLanguage {
  const fileName = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const special = specialNames[fileName];
  if (special) return special;
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? extensions[fileName.slice(dot + 1)] ?? "text" : "text";
}

export function createEditorLanguageLoader(loaders: LanguageModuleLoaders) {
  const cache = new Map<ParsedEditorLanguage, Promise<Extension>>();
  return (language: EditorLanguage): Promise<Extension> => {
    if (language === "text") return Promise.resolve(plainTextLanguageSupport);
    const existing = cache.get(language);
    if (existing) return existing;
    const loader = loaders[language];
    const pending = loader
      ? loader().then((extension) => [extension, editorSyntaxHighlighting]).catch(() => plainTextLanguageSupport)
      : Promise.resolve(plainTextLanguageSupport);
    cache.set(language, pending);
    return pending;
  };
}

export const loadEditorLanguage = createEditorLanguageLoader({
  markdown: () => import("@codemirror/lang-markdown").then(({ markdown }) => markdown()),
  json: () => import("@codemirror/lang-json").then(({ json }) => json()),
  yaml: () => import("@codemirror/lang-yaml").then(({ yaml }) => yaml()),
  javascript: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript()),
  jsx: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript({ jsx: true })),
  typescript: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript({ typescript: true })),
  tsx: () => import("@codemirror/lang-javascript").then(({ javascript }) => javascript({ jsx: true, typescript: true })),
  html: () => import("@codemirror/lang-html").then(({ html }) => html()),
  css: () => import("@codemirror/lang-css").then(({ css }) => css()),
  scss: () => import("@codemirror/lang-sass").then(({ sass }) => sass()),
  sass: () => import("@codemirror/lang-sass").then(({ sass }) => sass({ indented: true })),
  less: () => import("@codemirror/lang-less").then(({ less }) => less()),
  python: () => import("@codemirror/lang-python").then(({ python }) => python()),
  rust: () => import("@codemirror/lang-rust").then(({ rust }) => rust()),
  go: () => import("@codemirror/lang-go").then(({ go }) => go()),
  java: () => import("@codemirror/lang-java").then(({ java }) => java()),
  cpp: () => import("@codemirror/lang-cpp").then(({ cpp }) => cpp()),
  sql: () => import("@codemirror/lang-sql").then(({ sql }) => sql()),
  shell: () => import("@codemirror/legacy-modes/mode/shell").then(({ shell }) => StreamLanguage.define(shell)),
  dockerfile: () => import("@codemirror/legacy-modes/mode/dockerfile").then(({ dockerFile }) => StreamLanguage.define(dockerFile)),
});
