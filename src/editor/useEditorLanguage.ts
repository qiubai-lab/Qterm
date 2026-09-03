import { useEffect, useState } from "react";
import type { Extension } from "@codemirror/state";

import {
  loadEditorLanguage,
  plainTextLanguageSupport,
  type EditorLanguage,
} from "./editorLanguage";

interface LoadedLanguage {
  language: EditorLanguage;
  extension: Extension;
}

export function useEditorLanguage(language: EditorLanguage): Extension {
  const [loaded, setLoaded] = useState<LoadedLanguage | null>(null);
  const extension = loaded?.language === language ? loaded.extension : plainTextLanguageSupport;

  useEffect(() => {
    let active = true;
    void loadEditorLanguage(language).then((next) => {
      if (active) setLoaded({ language, extension: next });
    });
    return () => { active = false; };
  }, [language]);

  return extension;
}
