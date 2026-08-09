import type { WidgetViewProps } from '../registry';

interface Series {
  name?: string;
  points?: number[];
}

function buildPath(points: number[], width: number, height: number): string {
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

export function DataChart({ props }: WidgetViewProps) {
  const title = String(props.title ?? 'Chart');
  const series = (Array.isArray(props.series) ? props.series : []) as Series[];
  const width = 320;
  const height = 120;

  return (
    <div data-testid="data-chart" className="flex h-full flex-col">
      <h3 className="mb-3 text-sm opacity-80">{title}</h3>
      <div className="flex flex-1 flex-col gap-3">
        {series.map((item, idx) => {
          const points = item.points ?? [];
          const path = buildPath(points, width, height);
          return (
            <div key={idx}>
              <div className="mb-1 text-xs opacity-70">{item.name ?? `series_${idx}`}</div>
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-28 w-full overflow-visible"
                role="img"
                aria-label={item.name ?? 'chart'}
              >
                <path
                  d={path}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {points.map((p, i) => {
                  const min = Math.min(...points);
                  const max = Math.max(...points);
                  const span = max - min || 1;
                  const x = points.length === 1 ? 0 : (i / (points.length - 1)) * width;
                  const y = height - ((p - min) / span) * height;
                  return <circle key={i} cx={x} cy={y} r="3.5" fill="var(--color-ink)" />;
                })}
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}
