import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import type { FileSearchMatch } from "./fileSearchModel";

type SearchDecorationState = { matches: FileSearchMatch[]; activeIndex: number };

const setSearchDecorations = StateEffect.define<SearchDecorationState>();

const searchDecorationField = StateField.define({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSearchDecorations)) continue;
      next = Decoration.set(effect.value.matches.map((match, index) => Decoration.mark({
        class: index === effect.value.activeIndex
          ? "cm-file-search-match cm-file-search-match-active"
          : "cm-file-search-match",
      }).range(match.from, match.to)), true);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const codeEditorSearch: Extension = searchDecorationField;

export function setCodeEditorSearch(view: EditorView, matches: FileSearchMatch[], activeIndex: number) {
  const effects: StateEffect<unknown>[] = [setSearchDecorations.of({ matches, activeIndex })];
  const active = matches[activeIndex];
  if (active) effects.push(EditorView.scrollIntoView(active.from, { y: "center" }));
  view.dispatch({ effects });
}
