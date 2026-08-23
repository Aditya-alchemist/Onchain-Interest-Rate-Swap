import React, { useMemo, useState } from "react";
import { Download, Info, Upload } from "lucide-react";

import MarketChart, { buildRateCurve, CHART_COLORS } from "../components/MarketChart";
import StatStrip from "../components/StatStrip";
import { formatBps, formatUsdc, TX, useProtocol } from "../hooks/useProtocol";

export default function Lend() {
  const protocol = useProtocol();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const utilization = Number(protocol.utilizationBps) / 100;
  const rate = Number(protocol.borrowRateBps) / 100;
  const kinkPct = Number(protocol.kinkBps) / 100;

  const curve = useMemo(
    () =>
      buildRateCurve(
        {
          baseRateBps: protocol.baseRateBps,
          slope1Bps: protocol.slope1Bps,
          slope2Bps: protocol.slope2Bps,
          kinkBps: protocol.kinkBps,
        },
        2
      ),
    [protocol.baseRateBps, protocol.slope1Bps, protocol.slope2Bps, protocol.kinkBps]
  );

  return (
    <div className="page-grid split-grid">
      <section className="hero-panel">
        <div className="chart-head">
          <div>
            <h3>USDC lending pool</h3>
            <p>Suppliers earn the borrow rate, scaled by utilization. Higher utilization, higher yield.</p>
          </div>
          <div className="cur">
            <span>Utilization</span>
            <strong className="tone-amber">{utilization.toFixed(2)}%</strong>
          </div>
        </div>

        <div className="chart-legend">
          <span><i style={{ background: CHART_COLORS.primary }} /> Borrow APR</span>
          <span><i style={{ background: CHART_COLORS.warn }} /> Kink {kinkPct.toFixed(0)}%</span>
          <span><i style={{ background: CHART_COLORS.up }} /> Now {utilization.toFixed(1)}%</span>
        </div>

        <MarketChart
          data={curve}
          xKey="util"
          xUnit="%"
          yUnit="%"
          height={300}
          kinkX={kinkPct}
          markers={[{ x: Math.round(utilization / 2) * 2, y: rate, color: CHART_COLORS.up }]}
          series={[{ key: "rate", label: "Borrow APR", color: CHART_COLORS.primary, type: "area" }]}
        />

        <StatStrip
          items={[
            { label: "Available liquidity", value: `$${formatUsdc(protocol.poolLiquidity)}`, tone: "green" },
            { label: "Your deposit", value: `$${formatUsdc(protocol.poolDeposit)}`, tone: "blue" },
            { label: "Borrow rate", value: formatBps(protocol.borrowRateBps), tone: "amber" },
            { label: "Total deposits", value: `$${formatUsdc(protocol.poolTotalDeposits)}`, tone: "green" },
          ]}
        />
      </section>

      <aside className="right-stack">
        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Supply</h2><Upload size={18} /></div>
          <label>Amount</label>
          <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="1,000.00" />
          <button
            className="buy"
            disabled={protocol.isBusy(TX.poolDeposit)}
            onClick={() => protocol.depositToPool(depositAmount).catch(() => {})}
          >
            {protocol.isBusy(TX.poolDeposit) ? "Working…" : "Supply USDC"}
          </button>
          <div className="ticket-hint">
            <Info size={14} />
            <span>One click, two steps: we check your allowance, approve USDC only if needed, then deposit — no wasted transactions.</span>
          </div>
        </section>

        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Withdraw</h2><Download size={18} /></div>
          <label>Amount</label>
          <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder="250.00" />
          <button
            className="secondary"
            disabled={protocol.isBusy(TX.poolWithdraw)}
            onClick={() => protocol.withdrawFromPool(withdrawAmount).catch(() => {})}
          >
            {protocol.isBusy(TX.poolWithdraw) ? "Working…" : "Withdraw"}
          </button>
          <p>Withdraw up to your supplied balance, subject to available liquidity in the pool.</p>
        </section>
      </aside>
    </div>
  );
}
