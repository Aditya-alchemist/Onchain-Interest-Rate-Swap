import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Layers3,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import MarketChart, { buildRateCurve, CHART_COLORS } from "../components/MarketChart";
import { CandleChart, DonutChart, RadialGauge } from "../components/StatCharts";
import StatStrip from "../components/StatStrip";
import { useEthOhlc } from "../hooks/useEthOhlc";
import { formatEth, formatFactor, formatUsdc, useProtocol } from "../hooks/useProtocol";

type TabKey = "alerts" | "history" | "system";

export default function Dashboard() {
  const protocol = useProtocol();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("alerts");

  const rate = Number(protocol.borrowRateBps) / 100;
  const utilization = Number(protocol.utilizationBps) / 100;
  const kinkPct = Number(protocol.kinkBps) / 100;
  const baseRate = Number(protocol.baseRateBps) / 100;
  const cfPct = Number(protocol.collateralFactorBps) / 100;
  const ltPct = Number(protocol.liquidationThresholdBps) / 100;

  // Real ETH/USD candles from CoinGecko — the same feed the oracle bot
  // samples — with the on-chain oracle price drawn as a reference line.
  const { series: ethSeries, status: ohlcStatus, source: ohlcSource } = useEthOhlc(protocol.ethPriceUsd);
  const changeUp = ethSeries.change >= 0;

  // Real on-chain rate curve — no placeholder data.
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

  const maxRate = curve.length ? curve[curve.length - 1].rate : rate;

  // Pool composition (live lending-pool split), in USDC units.
  const available = Number(protocol.poolLiquidity) / 1e6;
  const borrowed = Number(protocol.poolTotalBorrows) / 1e6;
  const totalPool = available + borrowed;
  const poolSlices = [
    { name: "Available", value: available, color: CHART_COLORS.up },
    { name: "Borrowed", value: borrowed, color: CHART_COLORS.warn },
  ];

  // HedgeFi "markets" — a live watchlist driven entirely by protocol state.
  const markets = [
    {
      sym: "USDC",
      name: "Borrow APR",
      badge: "borrow",
      color: CHART_COLORS.down,
      last: `${rate.toFixed(2)}%`,
      sub: `${utilization.toFixed(1)}% util`,
      up: utilization > kinkPct,
    },
    {
      sym: "USDC",
      name: "Supply liquidity",
      badge: "lend",
      color: CHART_COLORS.up,
      last: `$${formatUsdc(protocol.poolLiquidity, 0)}`,
      sub: `$${formatUsdc(protocol.poolTotalDeposits, 0)} TVL`,
      up: true,
    },
    {
      sym: "ETH",
      name: "Oracle price",
      badge: "oracle",
      color: CHART_COLORS.primary,
      last: `$${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      sub: "USD / ETH",
      up: true,
    },
    {
      sym: "UTIL",
      name: "Pool utilization",
      badge: "meter",
      color: CHART_COLORS.warn,
      last: `${utilization.toFixed(2)}%`,
      sub: `kink ${kinkPct.toFixed(0)}%`,
      up: utilization > kinkPct,
    },
  ];

  const alerts = useMemo(() => {
    const list: Array<{ tone: string; title: string; meta: string; badge: string; icon: React.ReactNode }> = [];
    if (protocol.paused) {
      list.push({
        tone: "danger",
        badge: "Halted",
        title: "Protocol is paused",
        meta: "Governance",
        icon: <ShieldCheck size={15} />,
      });
    }
    if (utilization >= kinkPct && kinkPct > 0) {
      list.push({
        tone: "warn",
        badge: "High",
        title: `Utilization past kink (${kinkPct.toFixed(0)}%) — borrow rate steepening`,
        meta: "Rate model",
        icon: <Activity size={15} />,
      });
    }
    if (protocol.hasActiveLoan) {
      const hf = Number(protocol.healthFactorBps) / 100;
      list.push({
        tone: hf < 120 ? "danger" : hf < 150 ? "warn" : "active",
        badge: hf < 120 ? "Risk" : hf < 150 ? "Watch" : "Safe",
        title: `Loan #${protocol.loan?.tokenId} health factor ${formatFactor(protocol.healthFactorBps, true)}`,
        meta: "Your position",
        icon: <ShieldCheck size={15} />,
      });
    }
    if (protocol.hasActiveSwap) {
      list.push({
        tone: "active",
        badge: "Live",
        title: `Rate hedge #${protocol.swapId} active`,
        meta: "Hedge desk",
        icon: <Activity size={15} />,
      });
    }
    if (!list.length) {
      list.push({
        tone: "active",
        badge: "Clear",
        title: "No open positions. Markets are calm.",
        meta: "Desk",
        icon: <ShieldCheck size={15} />,
      });
    }
    return list;
  }, [protocol.paused, protocol.hasActiveLoan, protocol.hasActiveSwap, protocol.healthFactorBps, protocol.loan, protocol.swapId, utilization, kinkPct]);

  const healthPct = protocol.hasActiveLoan ? Math.min(Number(protocol.healthFactorBps) / 100, 100) : 0;
  const healthClass = !protocol.hasActiveLoan ? "" : healthPct < 60 ? "danger" : healthPct < 80 ? "warn" : "";

  return (
    <div className="dashboard-page">
      {/* ============ ROW 1 · ETH candlestick + right stack ============ */}
      <div className="page-grid dashboard-grid">
        <section className="hero-panel">
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
            height={306}
            refPrice={protocol.ethPriceUsd}
            refLabel={`oracle $${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          />

          <div className="buy-sell-row" style={{ display: "flex", gap: 10, margin: "12px 0 4px" }}>
            <button className="loan-action-primary" style={{ background: CHART_COLORS.up }} onClick={() => navigate("/lend")}>
              <ArrowUpRight size={16} /> Supply USDC
            </button>
            <button className="loan-action-primary" style={{ background: CHART_COLORS.down }} onClick={() => navigate("/borrow")}>
              <ArrowDownRight size={16} /> Borrow USDC
            </button>
          </div>

          <StatStrip
            items={[
              { label: "Total deposits", value: `$${formatUsdc(protocol.poolTotalDeposits)}`, tone: "green" },
              { label: "Total borrows", value: `$${formatUsdc(protocol.poolTotalBorrows)}`, tone: "red" },
              { label: "Base rate", value: `${baseRate.toFixed(2)}%`, tone: "blue" },
              { label: "Max APR", value: `${maxRate.toFixed(2)}%`, tone: "amber" },
            ]}
          />
        </section>

        <aside className="right-stack">
          <section className="panel-card">
            <div className="panel-header compact">
              <h2>Watchlist</h2>
              <CircleDollarSign size={17} />
            </div>
            <div className="watchlist">
              <div className="watch-head">
                <span>Market</span>
                <span>Last</span>
                <span>Detail</span>
              </div>
              {markets.map((m) => (
                <div className="watch-row" key={m.name}>
                  <div className="watch-sym">
                    <div className="watch-badge" style={{ background: m.color }}>{m.sym.slice(0, 2)}</div>
                    <div className="watch-sym-text">
                      <strong>{m.sym}</strong>
                      <small>{m.name}</small>
                    </div>
                  </div>
                  <span className={`num ${m.up ? "tone-green" : "tone-red"}`}>{m.last}</span>
                  <span className="num" style={{ color: "var(--muted)" }}>{m.sub}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="tab-row">
              <button className={`tab ${tab === "alerts" ? "active" : ""}`} onClick={() => setTab("alerts")}>
                Alerts
              </button>
              <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
                Positions
              </button>
              <button className={`tab ${tab === "system" ? "active" : ""}`} onClick={() => setTab("system")}>
                System
              </button>
            </div>

            {tab === "alerts" && (
              <div className="alert-list">
                {alerts.map((a, i) => (
                  <div className="alert-row" key={i}>
                    <div className={`alert-icon alert-badge ${a.tone}`}>{a.icon}</div>
                    <div className="alert-body">
                      <strong>{a.title}</strong>
                      <div className="alert-meta">
                        <span className={`alert-badge ${a.tone}`}>{a.badge}</span>
                        <span>{a.meta}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "history" && (
              <div className="quote-list tight">
                <div><span>Loan token</span><strong>{protocol.loan ? `#${protocol.loan.tokenId}` : "None"}</strong></div>
                <div><span>Debt</span><strong>{formatUsdc(protocol.debt)} USDC</strong></div>
                <div><span>Collateral</span><strong>{formatEth(protocol.loan?.collateralEth)} ETH</strong></div>
                <div><span>Swap position</span><strong>{protocol.swapId ? `#${protocol.swapId}` : "None"}</strong></div>
                <div><span>Escrow locked</span><strong>{formatUsdc(protocol.escrowLocked)} USDC</strong></div>
              </div>
            )}

            {tab === "system" && (
              <div className="quote-list tight">
                <div><span>Network</span><strong className="tone-green">Sepolia</strong></div>
                <div><span>Protocol</span><strong className={protocol.paused ? "tone-red" : "tone-green"}>{protocol.paused ? "Paused" : "Live"}</strong></div>
                <div><span>Oracle ETH</span><strong>${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong></div>
                <div><span>Market feed</span><strong className={ohlcStatus === "live" ? "tone-green" : "tone-amber"}>{ohlcStatus === "live" ? "CoinGecko live" : ohlcStatus === "loading" ? "Loading" : "Simulated"}</strong></div>
                <div><span>Collateral factor</span><strong>{cfPct.toFixed(0)}%</strong></div>
                <div><span>Liq. threshold</span><strong>{ltPct.toFixed(0)}%</strong></div>
              </div>
            )}
          </section>

          <section className="panel-card">
            <div className="panel-header compact">
              <h2>Loan health</h2>
              <ShieldCheck size={17} />
            </div>
            <div className={`health-meter ${healthClass}`}>
              <div style={{ width: `${healthPct}%` }} />
            </div>
            <div className="quote-list tight">
              <div><span>Health factor</span><strong className="tone-green">{formatFactor(protocol.healthFactorBps, protocol.hasActiveLoan)}</strong></div>
              <div><span>LTV</span><strong>{formatFactor(protocol.ltvBps, protocol.hasActiveLoan)}</strong></div>
              <div><span>Wallet USDC</span><strong>{formatUsdc(protocol.usdcBalance)}</strong></div>
            </div>
          </section>
        </aside>
      </div>

      {/* ============ ROW 2 · IRM curve + pool donut ============ */}
      <div className="admin-charts">
        <section className="panel-card chart-card">
          <div className="chart-head">
            <div>
              <h3><Activity size={15} /> Interest-rate model</h3>
              <p>Borrow APR vs pool utilization · computed live from the on-chain IRM</p>
            </div>
            <div className="chart-quote">
              <strong className="tone-blue">{rate.toFixed(2)}%</strong>
              <span>at {utilization.toFixed(0)}% util</span>
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
            height={250}
            kinkX={kinkPct}
            markers={[{ x: Math.round(utilization / 2) * 2, y: rate, color: CHART_COLORS.up, label: "now" }]}
            series={[{ key: "rate", label: "Borrow APR", color: CHART_COLORS.primary, type: "area" }]}
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
            centerValue={`$${totalPool.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
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

      {/* ============ ROW 3 · risk gauges ============ */}
      <section className="panel-card chart-card">
        <div className="chart-head">
          <div>
            <h3><ShieldCheck size={15} /> Risk parameters</h3>
            <p>Collateral, liquidation & utilization limits · live on-chain</p>
          </div>
        </div>
        <div className="gauge-grid">
          <RadialGauge value={cfPct} display={`${cfPct.toFixed(0)}%`} label="Collateral factor" color={CHART_COLORS.primary} />
          <RadialGauge value={ltPct} display={`${ltPct.toFixed(0)}%`} label="Liquidation threshold" color={CHART_COLORS.down} />
          <RadialGauge value={utilization} display={`${utilization.toFixed(0)}%`} label="Utilization" color={CHART_COLORS.up} />
        </div>
      </section>
    </div>
  );
}
