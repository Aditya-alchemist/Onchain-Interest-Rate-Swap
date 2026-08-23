import React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { borrowRateAtUtilization } from "../hooks/useProtocol";

// ============================================================
// Palette (works on both light and dark panels)
// ============================================================

export const CHART_COLORS = {
  primary: "#2962ff",
  up: "#089981",
  down: "#f23645",
  warn: "#f0a819",
  teal: "#0891b2",
  grid: "rgba(148,163,184,0.22)",
  axis: "#787b86",
};

// ============================================================
// Rate-curve data builder — replicates the on-chain IRM exactly
// ============================================================

export interface RateCurveParams {
  baseRateBps: bigint;
  slope1Bps: bigint;
  slope2Bps: bigint;
  kinkBps: bigint;
}

export interface RateCurvePoint {
  util: number; // utilization %
  rate: number; // borrow APR %
}

export function buildRateCurve(params: RateCurveParams, step = 2): RateCurvePoint[] {
  const p = {
    baseRateBps: Number(params.baseRateBps),
    slope1Bps: Number(params.slope1Bps),
    slope2Bps: Number(params.slope2Bps),
    kinkBps: Number(params.kinkBps),
  };
  const points: RateCurvePoint[] = [];
  for (let u = 0; u <= 100; u += step) {
    const rateBps = borrowRateAtUtilization(u * 100, p);
    points.push({ util: u, rate: Number((rateBps / 100).toFixed(2)) });
  }
  return points;
}

// ============================================================
// Generic series definition
// ============================================================

export interface ChartSeries {
  key: string;
  label: string;
  color?: string;
  type?: "area" | "line";
  dashed?: boolean;
}

export interface ChartMarker {
  x: number | string;
  y: number;
  color?: string;
  label?: string;
}

export interface MarketChartProps {
  data: Array<Record<string, any>>;
  xKey: string;
  series: ChartSeries[];
  height?: number;
  yUnit?: string;
  xUnit?: string;
  yDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  markers?: ChartMarker[];
  kinkX?: number; // draws a vertical reference line (utilization kink)
  decimals?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
  xKey,
  xUnit,
  yUnit,
  decimals,
}: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip__label">
        {typeof label === "number" ? `${label}${xUnit || ""}` : label}
      </div>
      {payload.map((entry: any) => (
        <div className="chart-tooltip__row" key={entry.dataKey}>
          <span className="chart-tooltip__dot" style={{ background: entry.color }} />
          <span className="chart-tooltip__name">{entry.name}</span>
          <strong className="chart-tooltip__val">
            {Number(entry.value).toFixed(decimals ?? 2)}
            {yUnit || ""}
          </strong>
        </div>
      ))}
    </div>
  );
}

export default function MarketChart({
  data,
  xKey,
  series,
  height = 320,
  yUnit = "",
  xUnit = "",
  yDomain = [0, "auto"],
  markers = [],
  kinkX,
  decimals = 2,
}: MarketChartProps) {
  return (
    <div className="market-chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 14, bottom: 6, left: -8 }}>
          <defs>
            {series.map((s) => (
              <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color || CHART_COLORS.primary} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color || CHART_COLORS.primary} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />

          <XAxis
            dataKey={xKey}
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_COLORS.grid }}
            tickFormatter={(v) => `${v}${xUnit}`}
            minTickGap={22}
          />
          <YAxis
            tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={54}
            domain={yDomain}
            tickFormatter={(v) => `${Number(v).toFixed(0)}${yUnit}`}
          />

          <Tooltip
            content={
              <CustomTooltip xKey={xKey} xUnit={xUnit} yUnit={yUnit} decimals={decimals} />
            }
            cursor={{ stroke: CHART_COLORS.axis, strokeDasharray: "3 3" }}
          />

          {kinkX !== undefined && (
            <ReferenceLine
              x={kinkX}
              stroke={CHART_COLORS.warn}
              strokeDasharray="4 4"
              label={{ value: "kink", fill: CHART_COLORS.warn, fontSize: 10, position: "top" }}
            />
          )}

          {series.map((s) =>
            s.type === "line" ? (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color || CHART_COLORS.primary}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color || CHART_COLORS.primary}
                strokeWidth={2}
                fill={`url(#grad-${s.key})`}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )
          )}

          {markers.map((m, i) => (
            <ReferenceDot
              key={`${m.x}-${i}`}
              x={m.x}
              y={m.y}
              r={5}
              fill={m.color || CHART_COLORS.up}
              stroke="#fff"
              strokeWidth={2}
              isFront
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
