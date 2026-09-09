import { useEffect, useRef } from "react";

import { Icon } from "../components/Icon";
import { ExactTextInput } from "../components/ExactTextInput";
import type { FileSearchDirection } from "./fileSearchModel";

export function FileSearchBar({ query, activeIndex, resultCount, truncated = false, onQueryChange, onMove, onClose }: {
  query: string;
  activeIndex: number;
  resultCount: number;
  truncated?: boolean;
  onQueryChange: (query: string) => void;
  onMove: (direction: FileSearchDirection) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return <div className="file-search" role="search" aria-label="搜索当前文件">
    <label className="file-search-field">
      <Icon name="search" size={13}/>
      <ExactTextInput
        ref={inputRef}
        type="search"
        aria-label="搜索内容"
        placeholder="搜索当前文件"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onClose(); }
          else if (event.key === "Enter") { event.preventDefault(); onMove(event.shiftKey ? "previous" : "next"); }
        }}
      />
    </label>
    <span className={`file-search-results${query && resultCount === 0 ? " empty" : ""}`} aria-live="polite">
      {query ? resultCount > 0 ? `${activeIndex + 1}/${resultCount}${truncated ? "+" : ""}` : "无结果" : ""}
    </span>
    <span className="file-search-navigation">
      <button type="button" aria-label="上一个匹配" disabled={!query || resultCount === 0} onClick={() => onMove("previous")}><Icon name="back" size={12}/></button>
      <button type="button" aria-label="下一个匹配" disabled={!query || resultCount === 0} onClick={() => onMove("next")}><Icon name="forward" size={12}/></button>
    </span>
    <button className="file-search-close" type="button" aria-label="关闭搜索" onClick={onClose}><Icon name="close" size={12}/></button>
  </div>;
}
