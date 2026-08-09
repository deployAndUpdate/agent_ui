import { useMemo, useState } from 'react';
import type { WidgetViewProps } from '../registry';

const PAGE_SIZE = 5;

export function DataTable({ props, onAction }: WidgetViewProps) {
  const columns = Array.isArray(props.columns) ? props.columns.map(String) : [];
  const rows = Array.isArray(props.rows) ? props.rows : [];
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const slice = useMemo(() => {
    const start = page * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  return (
    <div data-testid="data-table" className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm opacity-80">Data Table</h3>
        <button
          type="button"
          className="rounded-md border border-white/15 px-2 py-1 text-xs"
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
                <th key={col} className="border-b border-white/10 px-2 py-1.5 text-left opacity-70">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row, idx) => {
              const record = row as Record<string, unknown>;
              return (
                <tr key={idx} className="odd:bg-white/5">
                  {columns.map((col) => (
                    <td key={col} className="px-2 py-1.5">
                      {String(record[col] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-auto flex items-center justify-between pt-3 text-xs opacity-80">
        <span>
          Page {page + 1}/{pageCount}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 disabled:opacity-40"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded border border-white/15 px-2 py-1 disabled:opacity-40"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
