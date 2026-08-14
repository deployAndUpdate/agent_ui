import type { WidgetViewProps } from '../registry';

interface Series {
  name?: string;
  points?: number[];
}

interface Stat {
  label?: string;
  value?: string;
}

function buildLinePath(points: number[], width: number, height: number): string {
  if (points.length === 0) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  return points
    .map((p, i) => {
      const x = points.length === 1 ? 0 : (i / (points.length - 1)) * width;
      const y = height - ((p - min) / span) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildAreaPath(points: number[], width: number, height: number): string {
  const line = buildLinePath(points, width, height);
  if (!line) return '';
  return `${line} L${width},${height} L0,${height} Z`;
}

export function DataChart({ props }: WidgetViewProps) {
  const title = String(props.title);
  const chartType =
    props.chartType === 'bar' ? 'bar' : props.chartType === 'area' ? 'area' : 'line';
  const labels = Array.isArray(props.labels) ? props.labels.map(String) : [];
  const series = (Array.isArray(props.series) ? props.series : []) as Series[];
  const stats = (Array.isArray(props.stats) ? props.stats : []) as Stat[];
  const width = 400;
  const height = 130;

  const firstSeries = series[0]?.points ?? [];
  const min = firstSeries.length ? Math.min(...firstSeries) : 0;
  const max = firstSeries.length ? Math.max(...firstSeries) : 1;
  const span = max - min || 1;

  return (
    <div data-testid="data-chart" className="flex h-full flex-col">
      <h3 className="mb-3 text-sm font-medium text-slate-300/80">{title}</h3>
      <div className="flex flex-1 flex-col gap-3">
        {series.map((item, idx) => {
          const points = item.points ?? [];
          const linePath = buildLinePath(points, width, height);
          const areaPath = buildAreaPath(points, width, height);

          return (
            <div key={idx} className="flex-1">
              {chartType === 'bar' ? (
                <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full" role="img">
                  <defs>
                    <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                  </defs>
                  {points.map((p, i) => {
                    const barW = width / points.length - 8;
                    const barH = ((p - min) / span) * (height - 16);
                    const x = i * (width / points.length) + 4;
                    const y = height - barH;
                    return (
                      <rect key={i} x={x} y={y} width={barW} height={barH} rx="4" fill="url(#bar-gradient)" />
                    );
                  })}
                </svg>
              ) : (
                <svg viewBox={`0 0 ${width} ${height}`} className="h-32 w-full overflow-visible" role="img">
                  <defs>
                    <linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {chartType === 'area' && areaPath ? (
                    <path d={areaPath} fill="url(#area-gradient)" />
                  ) : null}
                  {linePath ? (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                </svg>
              )}
              {labels.length > 0 ? (
                <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  {labels.map((label, i) => (
                    <span key={i}>{label}</span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {stats.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/5 pt-3 sm:grid-cols-4">
          {stats.map((stat, idx) => (
            <div key={idx}>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</p>
              <p className="text-sm font-semibold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
