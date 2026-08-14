import type { WidgetViewProps } from '../registry';

export function ActionLog({ props }: WidgetViewProps) {
  const title = props.title != null ? String(props.title) : null;
  const entries = Array.isArray(props.entries) ? props.entries : [];

  return (
    <div data-testid="action-log" className="flex h-full flex-col">
      {title ? <h3 className="mb-3 text-sm font-medium text-slate-300/80">{title}</h3> : null}
      <ul className="max-h-64 space-y-3 overflow-auto text-sm">
        {entries.map((item, idx) => {
          const row = item as { at?: string; text?: string; amount?: string };
          return (
            <li key={idx} className="border-l-2 border-cyan-500/30 pl-3">
              {row.at != null ? (
                <time className="block text-xs text-slate-500">{row.at}</time>
              ) : null}
              {row.amount != null ? (
                <p className="font-semibold text-white">{row.amount}</p>
              ) : null}
              {row.text != null ? <span className="text-slate-300">{row.text}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
