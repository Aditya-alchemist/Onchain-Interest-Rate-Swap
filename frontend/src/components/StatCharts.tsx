import React from "react";
import {
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS } from "./MarketChart";

// ============================================================
// Shared palette re-export so pages can import from one place
// ============================================================

export { CHART_COLORS };

// ============================================================
// Candlestick series builder
// A deterministic price path anchored so the LAST close equals
// the live oracle price. Labelled in the UI as a simulated
// session path (there is no on-chain OHLC history to read).
// ============================================================

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  range: [number, number];
  ma?: number;
}

export interface CandleSeries {
  candles: Candle[];
  domain: [number, number];
  change: number; // % change first open -> last close
  last: number;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCandleSeries(
  currentPrice: number,
  count = 48,
  seed = 1337
): CandleSeries {
  const base = currentPrice && currentPrice > 0 ? currentPrice : 2000;
  const rng = mulberry32(seed);
  const vol = 0.014;
  const drift = 0.0006;

  // Random walk of closes (relative units).
  const closes: number[] = [1];
  for (let i = 1; i < count; i += 1) {
    const shock = (rng() - 0.5) * 2 * vol + drift;
    closes.push(closes[i - 1] * (1 + shock));
  }

  // Normalise so the last close lands exactly on the live price.
  const factor = base / closes[count - 1];
  const scaled = closes.map((v) => v * factor);

  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const candles: Candle[] = [];

  for (let i = 0; i < count; i += 1) {
    const open = i === 0 ? scaled[0] * (1 - (rng() - 0.5) * vol) : scaled[i - 1];
    const close = scaled[i];
    const wickUp = 1 + rng() * 0.007;
    const wickDn = 1 - rng() * 0.007;
    const high = Math.max(open, close) * wickUp;
    const low = Math.min(open, close) * wickDn;
    const d = new Date(now - (count - 1 - i) * hourMs);
    const t = `${String(d.getHours()).padStart(2, "0")}:00`;
    candles.push({
      t,
      o: open,
      h: high,
      l: low,
      c: close,
      range: [low, high],
    });
  }

  // 7-period moving average over closes.
  const period = 7;
  for (let i = 0; i < candles.length; i += 1) {
    if (i >= period - 1) {
      let sum = 0;
      for (let k = 0; k < period; k += 1) sum += candles[i - k].c;
      candles[i].ma = sum / period;
    }
  }

  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const pad = (hi - lo) * 0.08 || hi * 0.02;
  const change = ((candles[count - 1].c - candles[0].o) / candles[0].o) * 100;

  return {
    candles,
    domain: [lo - pad, hi + pad],
    change,
    last: base,
  };
}

// ============================================================
// Real OHLC → CandleSeries
// Maps CoinGecko's /coins/{id}/ohlc payload — an array of
// [timestamp_ms, open, high, low, close] rows — into the same
// CandleSeries shape the chart consumes. This is the exact price
// feed the keeper's oracle bot samples (CoinGecko ETH/USD), so the
// chart and the on-chain oracle share one source of truth.
// ============================================================

export function candlesFromOhlc(rows: number[][], maxPoints = 56): CandleSeries {
  const valid = Array.isArray(rows)
    ? rows.filter((r) => Array.isArray(r) && r.length >= 5 && Number.isFinite(r[4]))
    : [];
  if (valid.length < 2) {
    // Nothing usable — fall back to a flat anchored series.
    return buildCandleSeries(valid.length ? Number(valid[0][4]) : 0);
  }

  const sliced = valid.slice(-maxPoints);
  const candles: Candle[] = sliced.map((r) => {
    const [ts, o, h, l, c] = r;
    const d = new Date(ts);
    const t = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { t, o, h, l, c, range: [l, h] as [number, number] };
  });

  // 7-period moving average over closes.
  const period = 7;
  for (let i = 0; i < candles.length; i += 1) {
    if (i >= period - 1) {
      let sum = 0;
      for (let k = 0; k < period; k += 1) sum += candles[i - k].c;
      candles[i].ma = sum / period;
    }
  }

  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const pad = (hi - lo) * 0.08 || hi * 0.02;
  const first = candles[0].o;
  const last = candles[candles.length - 1].c;
  const change = first ? ((last - first) / first) * 100 : 0;

  return {
    candles,
    domain: [lo - pad, hi + pad],
    change,
    last,
  };
}

// ============================================================
// Candle shape — draws wick + body using the range-bar pixel box
// (recharts gives y = pixel(high), y+height = pixel(low))
// ============================================================

function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload || width == null) return null;
  const { o, h, l, c } = payload as Candle;
  const span = h - l || 1;
  const ratio = height / span; // pixels per price unit
  const openY = y + (h - o) * ratio;
  const closeY = y + (h - c) * ratio;
  const up = c >= o;
  const color = up ? CHART_COLORS.up : CHART_COLORS.down;
  const bodyTop = Math.min(openY, closeY);
  const bodyH = Math.max(Math.abs(closeY - openY), 1);
  const cx = x + width / 2;
  const bodyW = Math.max(width * 0.62, 1.5);
  const bodyX = cx - bodyW / 2;

  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1.2} />
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={0.5} />
    </g>
  );
}

function CandleTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload as Candle;
  const up = d.c >= d.o;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{d.t}</div>
      {[
        ["O", d.o],
        ["H", d.h],
        ["L", d.l],
        ["C", d.c],
      ].map(([k, v]) => (
        <div className="chart-tooltip__row" key={k as string}>
          <span className="chart-tooltip__name">{k}</span>
          <strong
            className="chart-tooltip__val"
            style={{ color: up ? CHART_COLORS.up : CHART_COLORS.down }}
          >
            {Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </strong>
        </div>
      ))}
    </div>
  );
}

/** A horizontal marker on the price axis (oracle price, liquidation price, …). */
export interface CandleRefLine {
  y: number;
  color?: string;
  label?: string;
  dash?: string;
  /** "insideTopLeft" by default; use insideBottomLeft to stop labels colliding. */
  position?: "insideTopLeft" | "insideBottomLeft" | "insideTopRight" | "insideBottomRight";
}

export interface CandleChartProps {
  series: CandleSeries;
  height?: number;
  showMa?: boolean;
  /** Draw a horizontal marker at the on-chain oracle price (what the keeper bot last pushed). */
  refPrice?: number;
  refLabel?: string;
  /** Extra markers — e.g. your own liquidation price drawn on the ETH chart. */
  refLines?: CandleRefLine[];
}

export function CandleChart({
  series,
  height = 300,
  showMa = true,
  refPrice,
  refLabel,
  refLines,
}: CandleChartProps) {
  const { candles, domain } = series;

  // Normalise refPrice + refLines into one list so the y-domain can stretch to
  // include every marker. Without this a liquidation price far below spot would
  // simply be clipped off the bottom of the chart.
  const lines: CandleRefLine[] = [];
  if (typeof refPrice === "number" && Number.isFinite(refPrice) && refPrice > 0) {
    lines.push({
      y: refPrice,
      color: CHART_COLORS.primary,
      label: refLabel || `oracle $${refPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      dash: "5 4",
      position: "insideTopLeft",
    });
  }
  for (const line of refLines ?? []) {
    if (typeof line.y === "number" && Number.isFinite(line.y) && line.y > 0) lines.push(line);
  }

  const yDomain: [number, number] = lines.length
    ? [
        Math.min(domain[0], ...lines.map((l) => l.y)) * 0.998,
        Math.max(domain[1], ...lines.map((l) => l.y)) * 1.002,
      ]
    : domain;

  return (
    <div className="market-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={candles} margin={{ top: 10, right: 14, bottom: 6, left: -6 }}>
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="t"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
            minTickGap={40}
          />
          <YAxis
            orientation="right"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={58}
            domain={yDomain}
            tickFormatter={(v) => `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          />
          <Tooltip content={<CandleTooltip />} cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: "3 3" }} />
          <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
          {showMa && (
            <Line
              type="monotone"
              dataKey="ma"
              stroke={CHART_COLORS.warn}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
          {lines.map((line, index) => (
            <ReferenceLine
              key={`${line.y}-${index}`}
              y={line.y}
              stroke={line.color || CHART_COLORS.primary}
              strokeDasharray={line.dash || "5 4"}
              strokeWidth={1.2}
              ifOverflow="extendDomain"
              label={{
                value: line.label,
                position: line.position || "insideTopLeft",
                fill: line.color || CHART_COLORS.primary,
                fontSize: 10,
                fontWeight: 700,
              }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============================================================
// Donut chart
// ============================================================

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  data: DonutSlice[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  unit?: string;
}

function DonutTooltip({ active, payload, unit }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0];
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__row">
        <span className="chart-tooltip__dot" style={{ background: p.payload.color }} />
        <span className="chart-tooltip__name">{p.name}</span>
        <strong className="chart-tooltip__val">
          {Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {unit || ""}
        </strong>
      </div>
    </div>
  );
}

export function DonutChart({ data, height = 200, centerLabel, centerValue, unit }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="donut-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? data : [{ name: "No data", value: 1, color: CHART_COLORS.grid }]}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {(total > 0 ? data : [{ name: "No data", value: 1, color: CHART_COLORS.grid }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip unit={unit} />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue) && (
        <div className="donut-center">
          {centerValue && <strong>{centerValue}</strong>}
          {centerLabel && <span>{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Radial half-gauge
// ============================================================

export interface RadialGaugeProps {
  value: number; // 0..100
  label: string;
  display: string;
  color?: string;
  height?: number;
}

export function RadialGauge({ value, label, display, color = CHART_COLORS.primary, height = 150 }: RadialGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="gauge-wrap" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={[{ value: clamped, fill: color }]}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background={{ fill: CHART_COLORS.grid } as any} dataKey="value" cornerRadius={7} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="gauge-center">
        <strong style={{ color }}>{display}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

// ============================================================
// Bar chart — grouped or stacked categories
// ============================================================

export interface BarSeries {
  key: string;
  label: string;
  color: string;
  /** Bars sharing a stackId are stacked on top of each other. */
  stackId?: string;
}

export interface CategoryBarsProps {
  /** One object per x-axis category, with a numeric value per series key. */
  data: Array<Record<string, any>>;
  series: BarSeries[];
  xKey?: string;
  height?: number;
  unit?: string;
  prefix?: string;
  /** Draw a dashed horizontal marker (e.g. break-even at zero). */
  refY?: number;
  refLabel?: string;
  showLegend?: boolean;
  /** Draw the bars horizontally instead of vertically. */
  layout?: "horizontal" | "vertical";
}

function BarTooltip({ active, payload, label, unit, prefix }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((entry: any) => (
        <div className="chart-tooltip__row" key={entry.dataKey}>
          <span className="chart-tooltip__dot" style={{ background: entry.color || entry.fill }} />
          <span className="chart-tooltip__name">{entry.name}</span>
          <strong className="chart-tooltip__val">
            {prefix || ""}
            {Number(entry.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {unit || ""}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function CategoryBars({
  data,
  series,
  xKey = "name",
  height = 240,
  unit,
  prefix,
  refY,
  refLabel,
  showLegend = false,
  layout = "horizontal",
}: CategoryBarsProps) {
  const vertical = layout === "vertical";
  const tickStyle = { fill: CHART_COLORS.axis, fontSize: 11 };
  const format = (v: any) =>
    `${prefix || ""}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}${unit || ""}`;

  return (
    <div className="market-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart
          data={data}
          layout={layout}
          margin={{ top: 10, right: 14, bottom: 4, left: vertical ? 8 : -8 }}
          barGap={2}
          barCategoryGap={vertical ? "22%" : "28%"}
        >
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={vertical} horizontal={!vertical} />

          {vertical ? (
            <>
              <XAxis
                type="number"
                tick={tickStyle}
                tickLine={false}
                axisLine={{ stroke: CHART_COLORS.grid }}
                tickFormatter={format}
              />
              <YAxis
                type="category"
                dataKey={xKey}
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                width={92}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={tickStyle}
                tickLine={false}
                axisLine={{ stroke: CHART_COLORS.grid }}
                minTickGap={12}
              />
              <YAxis
                orientation="right"
                tick={tickStyle}
                tickLine={false}
                axisLine={false}
                width={62}
                tickFormatter={format}
              />
            </>
          )}

          <Tooltip
            content={<BarTooltip unit={unit} prefix={prefix} />}
            cursor={{ fill: "rgba(148,163,184,0.10)" }}
          />
          {showLegend && (
            <Legend
              verticalAlign="top"
              height={26}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: CHART_COLORS.axis }}
            />
          )}

          {typeof refY === "number" && Number.isFinite(refY) && (
            <ReferenceLine
              {...(vertical ? { x: refY } : { y: refY })}
              stroke={CHART_COLORS.axis}
              strokeDasharray="4 4"
              label={
                refLabel
                  ? { value: refLabel, position: "insideTopRight", fill: CHART_COLORS.axis, fontSize: 10 }
                  : undefined
              }
            />
          )}

          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={s.stackId}
              fill={s.color}
              radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Single-series bar chart where each bar is coloured independently — used for
 * per-period hedge P&L, where positive periods are green and negative red.
 */
export interface SignedBarsProps {
  data: Array<{ name: string; value: number }>;
  height?: number;
  unit?: string;
  prefix?: string;
  upColor?: string;
  downColor?: string;
}

export function SignedBars({
  data,
  height = 200,
  unit,
  prefix,
  upColor = CHART_COLORS.up,
  downColor = CHART_COLORS.down,
}: SignedBarsProps) {
  return (
    <div className="market-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ReBarChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: -8 }} barCategoryGap="26%">
          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
            minTickGap={10}
          />
          <YAxis
            orientation="right"
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={62}
            tickFormatter={(v) =>
              `${prefix || ""}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit || ""}`
            }
          />
          <Tooltip
            content={<BarTooltip unit={unit} prefix={prefix} />}
            cursor={{ fill: "rgba(148,163,184,0.10)" }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.axis} strokeWidth={1} />
          <Bar dataKey="value" name="Net" isAnimationActive={false} radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.value >= 0 ? upColor : downColor} />
            ))}
          </Bar>
        </ReBarChart>
      </ResponsiveContainer>
    </div>
  );
}
