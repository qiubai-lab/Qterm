import { SearchAddon, type ISearchResultChangeEvent } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";

export interface TerminalSearchHost {
  terminal: Terminal;
  search?: SearchAddon;
  searchResultsHandler?: { dispose: () => void };
  onSearchResults?: (results: ISearchResultChangeEvent) => void;
}

export function ensureTerminalSearch(view: TerminalSearchHost): SearchAddon {
  let search = view.search;
  if (!search) {
    search = new SearchAddon();
    view.terminal.loadAddon(search);
    view.search = search;
  }
  if (!view.searchResultsHandler) {
    view.searchResultsHandler = search.onDidChangeResults((results) => view.onSearchResults?.(results));
  }
  return search;
}
