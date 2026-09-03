import { describe, expect, it, vi } from "vitest";
import type { Extension } from "@codemirror/state";

import {
  createEditorLanguageLoader,
  editorLanguageForFileName,
  plainTextLanguageSupport,
  type EditorLanguage,
} from "./editorLanguage";

describe("editorLanguageForFileName", () => {
  it.each<[string, EditorLanguage]>([
    ["index.js", "javascript"],
    ["worker.MJS", "javascript"],
    ["config.cjs", "javascript"],
    ["view.jsx", "jsx"],
    ["model.ts", "typescript"],
    ["config.mts", "typescript"],
    ["config.cts", "typescript"],
    ["view.tsx", "tsx"],
    ["index.html", "html"],
    ["theme.css", "css"],
    ["theme.scss", "scss"],
    ["theme.sass", "sass"],
    ["theme.less", "less"],
    ["script.py", "python"],
    ["main.rs", "rust"],
    ["main.go", "go"],
    ["Main.java", "java"],
    ["native.c", "cpp"],
    ["native.h", "cpp"],
    ["native.cpp", "cpp"],
    ["native.hpp", "cpp"],
    ["query.sql", "sql"],
    ["script.sh", "shell"],
    ["script.bash", "shell"],
    ["script.zsh", "shell"],
    ["README.md", "markdown"],
    ["data.json", "json"],
    ["config.yml", "yaml"],
    ["nested/path/Dockerfile", "dockerfile"],
    [".bashrc", "shell"],
    [".zshrc", "shell"],
  ])("maps %s to %s", (fileName, expected) => {
    expect(editorLanguageForFileName(fileName)).toBe(expected);
  });

  it("uses plain text for unknown and ambiguous names", () => {
    expect(editorLanguageForFileName("notes.unknown")).toBe("text");
    expect(editorLanguageForFileName("Makefile")).toBe("text");
    expect(editorLanguageForFileName("README")).toBe("text");
  });
});

describe("createEditorLanguageLoader", () => {
  it("loads each language once and shares the pending result", async () => {
    const support = { extension: "javascript" } as unknown as Extension;
    const javascript = vi.fn().mockResolvedValue(support);
    const load = createEditorLanguageLoader({ javascript });

    const first = load("javascript");
    const second = load("javascript");

    expect(first).toBe(second);
    const resolved = await first;
    expect(Array.isArray(resolved)).toBe(true);
    expect((resolved as Extension[])[0]).toBe(support);
    expect(javascript).toHaveBeenCalledTimes(1);
  });

  it("falls back to plain text when a language module cannot load", async () => {
    const javascript = vi.fn().mockRejectedValue(new Error("chunk unavailable"));
    const load = createEditorLanguageLoader({ javascript });

    await expect(load("javascript")).resolves.toBe(plainTextLanguageSupport);
    await expect(load("javascript")).resolves.toBe(plainTextLanguageSupport);
    expect(javascript).toHaveBeenCalledTimes(1);
  });

  it("does not invoke a module loader for plain or unsupported text", async () => {
    const javascript = vi.fn();
    const load = createEditorLanguageLoader({ javascript });

    await expect(load("text")).resolves.toBe(plainTextLanguageSupport);
    expect(javascript).not.toHaveBeenCalled();
  });
});
