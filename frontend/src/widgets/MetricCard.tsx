import type { WidgetViewProps } from '../registry';

export function MetricCard({ props, onAction }: WidgetViewProps) {
  const title = String(props.title);
  const value = props.value;
  const unit = props.unit != null ? String(props.unit) : null;
  const subtitle = props.subtitle != null ? String(props.subtitle) : null;
  const imageUrl = props.imageUrl != null ? String(props.imageUrl) : null;
  const imageAlt = props.imageAlt != null ? String(props.imageAlt) : null;
  const icon = props.icon != null ? String(props.icon) : null;
  const change = props.change != null ? String(props.change) : null;
  const changeType = props.changeType === 'down' ? 'down' : props.changeType === 'up' ? 'up' : null;

  if (imageUrl) {
    return (
      <div
        data-testid="metric-card"
        className="relative flex h-full min-h-[11rem] overflow-hidden rounded-xl"
      >
        <div className="relative z-10 flex flex-1 flex-col justify-center p-5">
          <p className="text-xs uppercase tracking-widest text-cyan-300/70">{title}</p>
          <p className="mt-2 max-w-[15rem] text-lg font-semibold leading-snug text-white">
            {String(value)}
          </p>
          {subtitle ? (
            <p className="mt-2 max-w-[14rem] text-sm text-slate-300/80">{subtitle}</p>
          ) : null}
        </div>
        <div className="absolute inset-y-0 right-0 w-[52%]">
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a1628] via-[#0a1628]/55 to-transparent" />
          <img
            src={imageUrl}
            alt={imageAlt ?? ''}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
    );
  }

  const changeColor =
    changeType === 'down' ? 'text-red-400' : changeType === 'up' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <div data-testid="metric-card" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-400">{title}</h3>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">
            {String(value)}
            {unit ? <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span> : null}
          </p>
          {change ? <p className={`mt-1 text-xs font-medium ${changeColor}`}>{change}</p> : null}
          {subtitle ? <p className="mt-2 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-lg">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-auto pt-4">
        <button
          type="button"
          className="rounded-md bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
          onClick={() => onAction?.('export_csv', { format: 'csv' })}
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
