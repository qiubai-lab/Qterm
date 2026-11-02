/** Uses the same row/column geometry as loaded records, without focusable placeholders. */
export function AccessLogSkeleton() {
  return Array.from({ length: 10 }, (_, row) => <li key={row} className="access-log-row access-log-skeleton" aria-hidden="true">
    {Array.from({ length: 7 }, (_, column) => <span key={column}/>)}
  </li>);
}
