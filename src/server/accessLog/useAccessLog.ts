import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../http";
import { dataPaused } from "../dataAccess";
import type { AccessLogPage, Filters } from "./model";

/** One cursor window per filter/refresh. Only the current page's records are retained. */
export function useAccessLog(filters: Filters) {
  const [current, setCurrent] = useState<{ page: AccessLogPage | null; index: number }>({ page: null, index: 0 });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const activeQuery = useRef("");
  const cursors = useRef<(string | undefined)[]>([undefined]);
  const pending = useRef(false);
  const { period, kind, result } = filters;
  const readPage = useCallback(async (index: number, abort: AbortController) => {
    pending.current = true;
    setBusy(true); setError("");
    const params = new URLSearchParams(activeQuery.current);
    const cursor = cursors.current[index];
    if (cursor) params.set("before", cursor);
    try {
      const page = await api<AccessLogPage>(`/access-log?${params}`, "GET", undefined, abort.signal);
      if (!abort.signal.aborted && !dataPaused()) {
        cursors.current = cursors.current.slice(0, index + 1);
        if (page.nextCursor) cursors.current.push(page.nextCursor);
        setCurrent({ page, index });
      }
    } catch (reason) {
      if (!abort.signal.aborted && !dataPaused()) setError(reason instanceof Error ? reason.message : "无法读取访问记录");
    } finally {
      if (!abort.signal.aborted) { pending.current = false; setBusy(false); }
    }
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    controller.current?.abort(); controller.current = abort;
    const now = Date.now();
    const params = new URLSearchParams({ to: String(now) });
    if (period !== "all") params.set("from", String(now - Number(period) * 86_400_000));
    if (kind) params.set("kind", kind);
    if (result) params.set("success", result);
    activeQuery.current = params.toString();
    cursors.current = [undefined];
    void (async () => { setCurrent({ page: null, index: 0 }); await readPage(0, abort); })();
    return () => abort.abort();
  }, [period, kind, result, revision, readPage]);

  function go(index: number) {
    if (pending.current || !controller.current || index < 0 || index >= cursors.current.length) return;
    void readPage(index, controller.current);
  }
  return {
    page: current.page, pageNumber: current.index + 1, busy, error,
    previous: () => go(current.index - 1), next: () => go(current.index + 1),
    refresh: () => setRevision(value => value + 1),
  };
}
