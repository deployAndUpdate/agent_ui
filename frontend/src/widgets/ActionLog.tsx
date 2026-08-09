import type { WidgetViewProps } from '../registry';

export function ActionLog({ props }: WidgetViewProps) {
  const entries = Array.isArray(props.entries) ? props.entries : [];

  return (
    <div data-testid="action-log" className="flex h-full flex-col">
      <h3 className="mb-3 text-sm opacity-80">Action Log</h3>
      <ul className="max-h-56 space-y-2 overflow-auto text-sm">
        {entries.map((item, idx) => {
          const row = item as { at?: string; text?: string };
          return (
            <li
              key={idx}
              className="rounded-md border border-white/5 bg-black/20 px-2 py-1.5"
            >
              <time className="mr-2 text-xs opacity-60">{row.at ?? ''}</time>
              <span>{row.text ?? ''}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
