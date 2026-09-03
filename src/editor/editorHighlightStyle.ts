import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const editorHighlightStyle = HighlightStyle.define([
  { tag: tags.meta, color: "var(--editor-syntax-meta)" },
  { tag: tags.link, color: "var(--editor-syntax-atom)", textDecoration: "underline" },
  { tag: tags.heading, color: "var(--editor-foreground)", textDecoration: "underline", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.keyword, color: "var(--editor-syntax-keyword)" },
  { tag: [tags.atom, tags.bool, tags.url, tags.contentSeparator, tags.labelName], color: "var(--editor-syntax-atom)" },
  { tag: [tags.literal, tags.inserted], color: "var(--editor-syntax-literal)" },
  { tag: [tags.string, tags.deleted], color: "var(--editor-syntax-string)" },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: "var(--editor-syntax-regexp)" },
  { tag: tags.definition(tags.variableName), color: "var(--editor-syntax-definition)" },
  { tag: tags.local(tags.variableName), color: "var(--editor-syntax-local)" },
  { tag: [tags.typeName, tags.namespace], color: "var(--editor-syntax-type)" },
  { tag: tags.className, color: "var(--editor-syntax-class)" },
  { tag: [tags.special(tags.variableName), tags.macroName], color: "var(--editor-syntax-special)" },
  { tag: tags.definition(tags.propertyName), color: "var(--editor-syntax-property)" },
  { tag: tags.comment, color: "var(--editor-syntax-comment)" },
  { tag: tags.invalid, color: "var(--editor-syntax-invalid)" },
]);

export const editorSyntaxHighlighting = syntaxHighlighting(editorHighlightStyle);
