import { useMemo, useState } from 'react';
import type { WidgetViewProps } from '../registry';

const PAGE_SIZE = 5;

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-400">{pct}%</span>
    </div>
  );
}

export function DataTable({ props, onAction }: WidgetViewProps) {
  const title = props.title != null ? String(props.title) : null;
  const columns = Array.isArray(props.columns) ? props.columns.map(String) : [];
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const progressColumns = new Set(
    Array.isArray(props.progressColumns) ? props.progressColumns.map(String) : [],
  );
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  return (
    <div data-testid="data-table" className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        {title ? <h3 className="text-sm font-medium text-slate-300/80">{title}</h3> : <span />}
        <button
          type="button"
          className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-cyan-300"
          onClick={() => onAction?.('export_csv', { format: 'csv', columns, rows })}
        >
          Export table
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="border-b border-white/5 px-2 py-2 text-left text-xs uppercase tracking-wide text-slate-500"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, idx) => {
              const record = row as Record<string, unknown>;
              return (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/[0.02]">
                  {columns.map((col) => (
                    <td key={col} className="px-2 py-2.5 text-slate-300">
                      {progressColumns.has(col) && typeof record[col] === 'number' ? (
                        <ProgressBar value={Number(record[col])} />
                      ) : (
                        String(record[col] ?? '')
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <div className="mt-auto flex items-center justify-between pt-3 text-xs text-slate-500">
          <span>
            Page {page + 1}/{pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-white/10 px-2 py-1 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </button>
            <button
              type="button"
              className="rounded border border-white/10 px-2 py-1 disabled:opacity-40"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
