import type { WidgetViewProps } from '../registry';

export function MetricCard({ props, onAction }: WidgetViewProps) {
  const title = String(props.title ?? 'Metric');
  const value = props.value ?? '—';
  const unit = props.unit ? String(props.unit) : '';

  return (
    <div data-testid="metric-card" className="flex h-full flex-col">
      <h3 className="text-sm opacity-80">{title}</h3>
      <p className="mt-2 text-4xl font-semibold tracking-tight">
        {String(value)}
        {unit ? <span className="ml-2 text-base font-normal opacity-70">{unit}</span> : null}
      </p>
      <div className="mt-auto pt-4">
        <button
          type="button"
          className="rounded-md bg-[color:var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-[#04140f]"
          onClick={() => onAction?.('export_csv', { format: 'csv' })}
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
