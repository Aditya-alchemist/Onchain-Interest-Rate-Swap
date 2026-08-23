import React, { useMemo } from "react";

import HedgePanel from "../components/HedgePanel";
import MarketChart, { buildRateCurve, CHART_COLORS } from "../components/MarketChart";
import StatStrip from "../components/StatStrip";
import { formatBps, formatUsdc, useProtocol } from "../hooks/useProtocol";

export default function Hedge() {
  const protocol = useProtocol();
  const currentRate = protocol.loan
    ? Number(protocol.loan.borrowRateBps) / 100
    : Number(protocol.borrowRateBps) / 100;
  const kinkPct = Number(protocol.kinkBps) / 100;
  const utilization = Number(protocol.utilizationBps) / 100;

  // Floating borrow APR (real curve) vs a flat fixed rate locked at today's level.
  const curve = useMemo(() => {
    const base = buildRateCurve(
      {
        baseRateBps: protocol.baseRateBps,
        slope1Bps: protocol.slope1Bps,
        slope2Bps: protocol.slope2Bps,
        kinkBps: protocol.kinkBps,
      },
      2
    );
    return base.map((p) => ({ ...p, fixed: Number(currentRate.toFixed(2)) }));
  }, [protocol.baseRateBps, protocol.slope1Bps, protocol.slope2Bps, protocol.kinkBps, currentRate]);

  return (
    <div className="page-grid split-grid">
      <section className="hero-panel">
        <div className="chart-head">
          <div>
            <h3>Floating vs fixed exposure</h3>
            <p>A rate swap locks a flat fixed rate. When utilization pushes the floating APR above it, the hedge pays off.</p>
          </div>
          <div className="cur">
            <span>Loan rate</span>
            <strong className="tone-blue">{currentRate.toFixed(2)}%</strong>
          </div>
        </div>

        <div className="chart-legend">
          <span><i style={{ background: CHART_COLORS.primary }} /> Floating APR</span>
          <span><i style={{ background: CHART_COLORS.teal }} /> Fixed {currentRate.toFixed(2)}%</span>
          <span><i style={{ background: CHART_COLORS.warn }} /> Kink {kinkPct.toFixed(0)}%</span>
        </div>

        <MarketChart
          data={curve}
          xKey="util"
          xUnit="%"
          yUnit="%"
          height={310}
          kinkX={kinkPct}
          markers={[{ x: Math.round(utilization / 2) * 2, y: currentRate, color: CHART_COLORS.up }]}
          series={[
            { key: "rate", label: "Floating APR", color: CHART_COLORS.primary, type: "area" },
            { key: "fixed", label: "Fixed", color: CHART_COLORS.teal, type: "line", dashed: true },
          ]}
        />

        <StatStrip
          items={[
            { label: "Loan principal", value: `${formatUsdc(protocol.loan?.principalUsdc)} USDC`, tone: "blue" },
            { label: "Debt", value: `${formatUsdc(protocol.debt)} USDC`, tone: "amber" },
            { label: "Current borrow", value: formatBps(protocol.borrowRateBps), tone: "green" },
            { label: "Swap ID", value: protocol.swapId ? `#${protocol.swapId}` : "None", tone: "blue" },
          ]}
        />
      </section>

      <aside className="right-stack">
        <HedgePanel />
      </aside>
    </div>
  );
}
