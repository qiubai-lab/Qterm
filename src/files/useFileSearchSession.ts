import { useCallback, useMemo, useState } from "react";

import { findFileSearchMatches, moveFileSearchIndex, type FileSearchDirection } from "./fileSearchModel";

export const MAX_FILE_SEARCH_MATCHES = 5_000;

export function useFileSearchSession(source: string) {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState("");
  const [requestedIndex, setRequestedIndex] = useState(0);
  const discoveredMatches = useMemo(() => findFileSearchMatches(source, query, MAX_FILE_SEARCH_MATCHES + 1), [query, source]);
  const truncated = discoveredMatches.length > MAX_FILE_SEARCH_MATCHES;
  const matches = useMemo(() => discoveredMatches.slice(0, MAX_FILE_SEARCH_MATCHES), [discoveredMatches]);
  const activeIndex = matches.length === 0 ? -1 : Math.min(requestedIndex, matches.length - 1);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
    setRequestedIndex(0);
  }, []);

  const move = useCallback((direction: FileSearchDirection) => {
    setRequestedIndex((current) => moveFileSearchIndex(current, matches.length, direction));
  }, [matches.length]);

  const close = useCallback(() => {
    setOpen(false);
    setQueryState("");
    setRequestedIndex(0);
  }, []);

  return {
    open,
    query,
    matches,
    truncated,
    activeIndex,
    openSearch: useCallback(() => setOpen(true), []),
    closeSearch: close,
    setQuery,
    move,
  };
}
