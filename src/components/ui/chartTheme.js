/**
 * One chart theme for the whole app.
 *
 * The house style: no axis lines, no tick marks, 1px dashed horizontal
 * gridlines at low opacity, small muted tick labels, thin bars with rounded
 * caps, and flat fills rather than the heavy saturated gradients the charts
 * used to carry. Spread these into the Recharts components.
 */

export const CHART = {
  profit: '#34D399',
  loss: '#F87171',
  brand: '#3B82F6',
  warn: '#FBBF24',
  caution: '#FB923C',
  muted: '#8A8A93',
  grid: 'rgba(255,255,255,0.07)',
};

/** Horizontal rules only — vertical gridlines add noise on categorical axes. */
export const gridProps = {
  strokeDasharray: '2 4',
  stroke: CHART.grid,
  vertical: false,
};

export const xAxisProps = {
  stroke: CHART.muted,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: CHART.muted },
  dy: 4,
};

export const yAxisProps = {
  stroke: CHART.muted,
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: CHART.muted },
  width: 52,
};

export const tooltipProps = {
  contentStyle: {
    background: '#1C1C21',
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: '10px',
    boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
    padding: '8px 12px',
  },
  labelStyle: { color: '#F5F5F7', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: '#A1A1AA', fontSize: 12 },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

/** Thin bars with rounded caps, and a short entry animation. */
export const barProps = {
  radius: [4, 4, 0, 0],
  maxBarSize: 34,
  animationDuration: 450,
};

export const lineProps = {
  strokeWidth: 2,
  dot: false,
  animationDuration: 450,
};

export const usdTick = (v) => `$${Number(v).toFixed(0)}`;
export const pctTick = (v) => `${Number(v).toFixed(0)}%`;
