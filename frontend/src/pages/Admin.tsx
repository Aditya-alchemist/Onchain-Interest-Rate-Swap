import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Coins,
  Layers3,
  LineChart,
  Shield,
  ShieldCheck,
} from "lucide-react";

import MarketChart, { buildRateCurve, CHART_COLORS } from "../components/MarketChart";
import { CandleChart, DonutChart, RadialGauge } from "../components/StatCharts";
import { CONTRACT_ADDRESSES } from "../lib/contracts";
import { useEthOhlc } from "../hooks/useEthOhlc";
import { formatBps, formatUsdc, govTxKey, mintTxKey, useProtocol } from "../hooks/useProtocol";

/** Whole-number bps input guard — blank/garbage would reach ethers as NaN. */
function bps(value: string): bigint {
  const text = (value || "").trim();
  if (!/^\d+$/.test(text)) return BigInt(0);
  return BigInt(text);
}

export default function Admin() {
  const protocol = useProtocol();
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [treasury, setTreasury] = useState("");
  const [collateralFactor, setCollateralFactor] = useState("");
  const [liquidationThreshold, setLiquidationThreshold] = useState("");
  const [baseRate, setBaseRate] = useState("");
  const [maxRate, setMaxRate] = useState("");
  const [settlementInterval, setSettlementInterval] = useState("");
  const [protocolFee, setProtocolFee] = useState("");
  const [keeper, setKeeper] = useState("");

  // ---- Derived, real on-chain figures --------------------------------
  const available = Number(protocol.poolLiquidity) / 1e6;
  const borrowed = Number(protocol.poolTotalBorrows) / 1e6;
  const total = available + borrowed;
  const utilPct = Number(protocol.utilizationBps) / 100;
  const cfPct = Number(protocol.collateralFactorBps) / 100;
  const ltPct = Number(protocol.liquidationThresholdBps) / 100;
  const feePct = Number(protocol.protocolFeeBps) / 100;
  const kinkPct = Number(protocol.kinkBps) / 100;
  const borrowApr = Number(protocol.borrowRateBps) / 100;

  // ETH candlestick — real CoinGecko market candles (the same live feed the
  // oracle bot samples) with the on-chain oracle price drawn as a reference line.
  const { series: ethSeries, status: ohlcStatus, source: ohlcSource } = useEthOhlc(protocol.ethPriceUsd);

  // Interest-rate model curve (identical to the on-chain IRM).
  const rateCurve = useMemo(
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

  const poolSlices = [
    { name: "Available", value: available, color: CHART_COLORS.up },
    { name: "Borrowed", value: borrowed, color: CHART_COLORS.warn },
  ];

  const changeUp = ethSeries.change >= 0;

  return (
    <div className="admin-page">
      {/* ============ HEADER + KPIs ============ */}
      <section className="hero-panel admin-hero">
        <div className="panel-header">
          <div>
            <span className="eyebrow">ADMIN CONSOLE</span>
            <h1>Protocol operations</h1>
          </div>
          <div className="header-chips">
            <div className="price-chip">
              <span>ETH oracle</span>
              <strong style={{ color: "var(--accent)" }}>
                ${protocol.ethPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </strong>
            </div>
            <div className={`status-pill ${protocol.paused ? "danger" : "live"}`}>
              <span className="dot" />
              {protocol.paused ? "Paused" : "Live"}
            </div>
          </div>
        </div>

        <div className="admin-kpis">
          <div className="kpi-tile">
            <span className="kpi-label">Pool liquidity</span>
            <strong className="kpi-value tone-green">{formatUsdc(protocol.poolLiquidity)}</strong>
            <span className="kpi-sub">USDC available</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Total borrows</span>
            <strong className="kpi-value tone-amber">{formatUsdc(protocol.poolTotalBorrows)}</strong>
            <span className="kpi-sub">USDC outstanding</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Utilization</span>
            <strong className="kpi-value tone-blue">{utilPct.toFixed(2)}%</strong>
            <span className="kpi-sub">borrows / deposits</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Borrow APR</span>
            <strong className="kpi-value tone-red">{borrowApr.toFixed(2)}%</strong>
            <span className="kpi-sub">current floating</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Protocol fee</span>
            <strong className="kpi-value">{feePct.toFixed(2)}%</strong>
            <span className="kpi-sub">on interest</span>
          </div>
          <div className="kpi-tile">
            <span className="kpi-label">Settlement</span>
            <strong className="kpi-value">{Number(protocol.settlementInterval).toLocaleString()}s</strong>
            <span className="kpi-sub">swap interval</span>
          </div>
        </div>
      </section>

      {/* ============ CANDLES + POOL DONUT ============ */}
      <div className="admin-charts">
        <section className="panel-card chart-card">
          <div className="chart-head">
            <div>
              <h3><LineChart size={15} /> ETH / USD</h3>
              <p className="chart-src-line">
                <span className={`chart-src ${ohlcStatus}`}>
                  <i /> {ohlcSource}
                </span>
                &nbsp;· market ${ethSeries.last.toLocaleString(undefined, { maximumFractionDigits: 2 })} · oracle marker = protocol price
              </p>
            </div>
            <div className="chart-quote">
              <strong>${protocol.ethPriceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
              <span className={changeUp ? "tone-green" : "tone-red"}>
                {changeUp ? "▲" : "▼"} {Math.abs(ethSeries.change).toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="chart-legend">
            <span><i style={{ background: CHART_COLORS.up }} /> Up candle</span>
            <span><i style={{ background: CHART_COLORS.down }} /> Down candle</span>
            <span><i style={{ background: CHART_COLORS.warn }} /> MA(7)</span>
            <span><i style={{ background: CHART_COLORS.primary }} /> Oracle ${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          </div>
          <CandleChart
            series={ethSeries}
            height={300}
            refPrice={protocol.ethPriceUsd}
            refLabel={`oracle $${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          />
        </section>

        <section className="panel-card chart-card">
          <div className="chart-head">
            <div>
              <h3><Layers3 size={15} /> Pool composition</h3>
              <p>Live lending-pool split</p>
            </div>
          </div>
          <DonutChart
            data={poolSlices}
            height={200}
            unit=" USDC"
            centerValue={`$${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            centerLabel="Total deposits"
          />
          <div className="quote-list tight" style={{ marginTop: 6 }}>
            <div>
              <span><i className="legend-dot" style={{ background: CHART_COLORS.up }} /> Available</span>
              <strong>{formatUsdc(protocol.poolLiquidity)}</strong>
            </div>
            <div>
              <span><i className="legend-dot" style={{ background: CHART_COLORS.warn }} /> Borrowed</span>
              <strong>{formatUsdc(protocol.poolTotalBorrows)}</strong>
            </div>
          </div>
        </section>
      </div>

      {/* ============ IRM CURVE + RISK GAUGES ============ */}
      <div className="admin-charts">
        <section className="panel-card chart-card">
          <div className="chart-head">
            <div>
              <h3><Activity size={15} /> Interest-rate model</h3>
              <p>Borrow APR vs utilization · kink at {kinkPct.toFixed(0)}%</p>
            </div>
            <div className="chart-quote">
              <strong className="tone-blue">{borrowApr.toFixed(2)}%</strong>
              <span>at {utilPct.toFixed(0)}% util</span>
            </div>
          </div>
          <MarketChart
            data={rateCurve}
            xKey="util"
            xUnit="%"
            yUnit="%"
            height={252}
            kinkX={kinkPct}
            markers={[{ x: Math.round(utilPct / 2) * 2, y: borrowApr, color: CHART_COLORS.up }]}
            series={[{ key: "rate", label: "Borrow APR", color: CHART_COLORS.primary, type: "area" }]}
          />
        </section>

        <section className="panel-card chart-card">
          <div className="chart-head">
            <div>
              <h3><ShieldCheck size={15} /> Risk parameters</h3>
              <p>Collateral & liquidation limits</p>
            </div>
          </div>
          <div className="gauge-grid">
            <RadialGauge value={cfPct} display={`${cfPct.toFixed(0)}%`} label="Collateral factor" color={CHART_COLORS.primary} />
            <RadialGauge value={ltPct} display={`${ltPct.toFixed(0)}%`} label="Liquidation" color={CHART_COLORS.down} />
            <RadialGauge value={utilPct} display={`${utilPct.toFixed(0)}%`} label="Utilization" color={CHART_COLORS.up} />
          </div>
        </section>
      </div>

      {/* ============ CONTROL PANELS ============ */}
      <div className="admin-grid">
        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Mint &amp; fund</h2><Coins size={17} /></div>
          <label>Recipient</label>
          <input value={mintTo} onChange={(event) => setMintTo(event.target.value)} placeholder="0x..." />
          <label>Amount USDC</label>
          <input value={mintAmount} onChange={(event) => setMintAmount(event.target.value)} placeholder="10000" />
          <button
            className="buy"
            disabled={protocol.isBusy(mintTxKey(mintTo))}
            onClick={() => protocol.mintUsdc(mintTo, mintAmount).catch(() => {})}
          >
            {protocol.isBusy(mintTxKey(mintTo)) ? "Minting…" : "Mint USDC"}
          </button>
          <button
            className="secondary"
            disabled={protocol.isBusy(mintTxKey(CONTRACT_ADDRESSES.LendingPool))}
            onClick={() => protocol.mintUsdc(CONTRACT_ADDRESSES.LendingPool, mintAmount).catch(() => {})}
          >
            {protocol.isBusy(mintTxKey(CONTRACT_ADDRESSES.LendingPool)) ? "Funding…" : "Fund pool"}
          </button>
          <button
            className="secondary"
            disabled={protocol.isBusy(mintTxKey(CONTRACT_ADDRESSES.EscrowManager))}
            onClick={() => protocol.mintUsdc(CONTRACT_ADDRESSES.EscrowManager, mintAmount).catch(() => {})}
          >
            {protocol.isBusy(mintTxKey(CONTRACT_ADDRESSES.EscrowManager)) ? "Funding…" : "Fund escrow"}
          </button>
          <div className="ticket-hint warn">
            <AlertTriangle size={14} />
            <span>
              "Fund escrow" only moves raw tokens into the EscrowManager contract — it does not credit any
              account's escrow balance, because <code>deposit()</code> credits <code>msg.sender</code>. To give a
              wallet spendable escrow, mint to that wallet and deposit from the Settlement desk.
            </span>
          </div>
        </section>

        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Governance</h2><Shield size={17} /></div>
          <div className="quote-list tight">
            <div><span>Treasury</span><strong className="mono-addr">{protocol.treasury ? `${protocol.treasury.slice(0, 6)}…${protocol.treasury.slice(-4)}` : "Unset"}</strong></div>
            <div><span>Collateral factor</span><strong>{formatBps(protocol.collateralFactorBps)}</strong></div>
            <div><span>Liquidation threshold</span><strong>{formatBps(protocol.liquidationThresholdBps)}</strong></div>
          </div>
          <label>Treasury address</label>
          <input value={treasury} onChange={(event) => setTreasury(event.target.value)} placeholder="0x..." />
          <button
            disabled={protocol.isBusy(govTxKey("setTreasury"))}
            onClick={() => protocol.setGovernanceValue("setTreasury", [treasury]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setTreasury")) ? "Working…" : "Set treasury"}
          </button>
          <label>Collateral factor bps</label>
          <input value={collateralFactor} onChange={(event) => setCollateralFactor(event.target.value)} placeholder="7500" />
          <button
            disabled={protocol.isBusy(govTxKey("setCollateralFactor"))}
            onClick={() => protocol.setGovernanceValue("setCollateralFactor", [bps(collateralFactor)]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setCollateralFactor")) ? "Working…" : "Set collateral factor"}
          </button>
          <label>Liquidation threshold bps</label>
          <input value={liquidationThreshold} onChange={(event) => setLiquidationThreshold(event.target.value)} placeholder="8000" />
          <button
            disabled={protocol.isBusy(govTxKey("setLiquidationThreshold"))}
            onClick={() => protocol.setGovernanceValue("setLiquidationThreshold", [bps(liquidationThreshold)]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setLiquidationThreshold")) ? "Working…" : "Set threshold"}
          </button>
        </section>

        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Rates &amp; fees</h2><Activity size={17} /></div>
          <label>Base borrow rate bps</label>
          <input value={baseRate} onChange={(event) => setBaseRate(event.target.value)} placeholder="200" />
          <label>Max borrow rate bps</label>
          <input value={maxRate} onChange={(event) => setMaxRate(event.target.value)} placeholder="2000" />
          <button
            disabled={protocol.isBusy(govTxKey("setBorrowRateBounds"))}
            onClick={() => protocol.setGovernanceValue("setBorrowRateBounds", [bps(baseRate), bps(maxRate)]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setBorrowRateBounds")) ? "Working…" : "Set rate bounds"}
          </button>
          <label>Settlement interval (s)</label>
          <input value={settlementInterval} onChange={(event) => setSettlementInterval(event.target.value)} placeholder="2592000" />
          <button
            disabled={protocol.isBusy(govTxKey("setSettlementInterval"))}
            onClick={() => protocol.setGovernanceValue("setSettlementInterval", [bps(settlementInterval)]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setSettlementInterval")) ? "Working…" : "Set interval"}
          </button>
          <label>Protocol fee bps</label>
          <input value={protocolFee} onChange={(event) => setProtocolFee(event.target.value)} placeholder="100" />
          <button
            disabled={protocol.isBusy(govTxKey("setProtocolFee"))}
            onClick={() => protocol.setGovernanceValue("setProtocolFee", [bps(protocolFee)]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("setProtocolFee")) ? "Working…" : "Set fee"}
          </button>
        </section>

        <section className="panel-card trade-ticket">
          <div className="panel-header compact"><h2>Access &amp; emergency</h2><AlertTriangle size={17} /></div>
          <label>Keeper address</label>
          <input value={keeper} onChange={(event) => setKeeper(event.target.value)} placeholder="0x..." />
          <button
            className="secondary"
            disabled={protocol.isBusy(govTxKey("grantKeeper"))}
            onClick={() => protocol.setGovernanceValue("grantKeeper", [keeper]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("grantKeeper")) ? "Working…" : "Grant keeper"}
          </button>
          <button
            className="secondary"
            disabled={protocol.isBusy(govTxKey("revokeKeeper"))}
            onClick={() => protocol.setGovernanceValue("revokeKeeper", [keeper]).catch(() => {})}
          >
            {protocol.isBusy(govTxKey("revokeKeeper")) ? "Working…" : "Revoke keeper"}
          </button>
          {protocol.paused ? (
            <button
              className="buy"
              disabled={protocol.isBusy(govTxKey("unpause"))}
              onClick={() => protocol.setGovernanceValue("unpause", []).catch(() => {})}
            >
              {protocol.isBusy(govTxKey("unpause")) ? "Working…" : "Unpause protocol"}
            </button>
          ) : (
            <button
              className="sell"
              disabled={protocol.isBusy(govTxKey("pause"))}
              onClick={() => protocol.setGovernanceValue("pause", []).catch(() => {})}
            >
              {protocol.isBusy(govTxKey("pause")) ? "Working…" : "Pause protocol"}
            </button>
          )}
          <div className="quote-list tight" style={{ marginTop: 4 }}>
            <div><span>Pool liquidity</span><strong>{formatUsdc(protocol.poolLiquidity)} USDC</strong></div>
            <div><span>Total borrows</span><strong>{formatUsdc(protocol.poolTotalBorrows)} USDC</strong></div>
          </div>
        </section>
      </div>
    </div>
  );
}
