import React, { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  CandlestickChart,
  Layers3,
  PieChart as PieIcon,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import MarketChart, { CHART_COLORS } from "./MarketChart";
import { CandleChart, CategoryBars, DonutChart, RadialGauge, SignedBars } from "./StatCharts";
import type { CandleRefLine } from "./StatCharts";
import type { EthOhlc } from "../hooks/useEthOhlc";
import type { PortfolioRow } from "../hooks/usePortfolioHistory";
import { formatBps, formatUsdc, toUsdcNumber } from "../hooks/useProtocol";
import type { ProtocolApi } from "../hooks/useProtocol";

/**
 * ============================================================
 * PortfolioCharts
 * ============================================================
 *
 * Every number here comes from the shared protocol store, i.e. straight from
 * the Sepolia deployment. The only two inputs that are not a single on-chain
 * read are labelled as such in the UI:
 *
 *  - the value history, which this app records itself from real reads
 *    (see usePortfolioHistory), and
 *  - the price ladder / hedge cashflows, which are arithmetic projections of
 *    live values using the same formulas the contracts use.
 */

const BPS = 10_000;
const YEAR = 31_536_000;

type HistoryRow = PortfolioRow;

function usd(value: number, digits = 2): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

function clamp(value: number, min = 0, max = 100): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// ============================================================
// 1. Portfolio value over time
// ============================================================

export function PortfolioValuePanel({
  rows,
  ready,
  netChange,
  netChangePct,
  windowStart,
  net,
}: {
  rows: HistoryRow[];
  ready: boolean;
  netChange: number;
  netChangePct: number;
  windowStart: number;
  net: number;
}) {
  const up = netChange >= 0;

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <Activity size={15} /> Portfolio value
          </h3>
          <p>
            {ready
              ? `Recorded from live reads since ${new Date(windowStart).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })} · ${rows.length} samples`
              : "Recording — this chart fills in as the app reads your balances"}
          </p>
        </div>
        <div className="chart-quote">
          <strong>{usd(net)}</strong>
          <span className={up ? "tone-green" : "tone-red"}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {up ? "+" : "−"}
            {usd(Math.abs(netChange))} ({Math.abs(netChangePct).toFixed(2)}%)
          </span>
        </div>
      </div>

      {ready ? (
        <>
          <div className="chart-legend">
            <span>
              <i style={{ background: CHART_COLORS.primary }} /> Net value
            </span>
            <span>
              <i style={{ background: CHART_COLORS.teal }} /> Collateral (ETH)
            </span>
            <span>
              <i style={{ background: CHART_COLORS.down }} /> Debt
            </span>
          </div>
          <MarketChart
            data={rows}
            xKey="label"
            height={272}
            yUnit=""
            yDomain={["auto", "auto"]}
            series={[
              { key: "net", label: "Net value", color: CHART_COLORS.primary, type: "area" },
              { key: "collateral", label: "Collateral", color: CHART_COLORS.teal, type: "line" },
              { key: "debt", label: "Debt", color: CHART_COLORS.down, type: "line", dashed: true },
            ]}
          />
        </>
      ) : (
        <div className="empty-state">
          Nothing recorded yet. Leave this tab open — the app samples your real balances every 15 seconds
          and after every transaction, and keeps the history between sessions.
        </div>
      )}
    </section>
  );
}

// ============================================================
// 2. Composition pie
// ============================================================

export function CompositionPanel({ protocol }: { protocol: ProtocolApi }) {
  const value = protocol.portfolioValueUsd;

  const slices = useMemo(
    () =>
      [
        { name: "Wallet USDC", value: value.wallet, color: CHART_COLORS.up },
        { name: "Supplied to pool", value: value.supplied, color: CHART_COLORS.primary },
        { name: "Escrow", value: value.escrow, color: CHART_COLORS.warn },
        { name: "ETH collateral", value: value.collateral, color: CHART_COLORS.teal },
      ].filter((slice) => slice.value > 0),
    [value.collateral, value.escrow, value.supplied, value.wallet]
  );

  const gross = value.wallet + value.supplied + value.escrow + value.collateral;

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <PieIcon size={15} /> Where your value sits
          </h3>
          <p>Live balances · debt subtracted below</p>
        </div>
      </div>

      {slices.length ? (
        <DonutChart
          data={slices}
          height={196}
          unit=""
          centerValue={usd(gross, 0)}
          centerLabel="Gross assets"
        />
      ) : (
        <div className="empty-state">No balances yet. Mint test USDC from the Admin console to begin.</div>
      )}

      <div className="quote-list tight" style={{ marginTop: 6 }}>
        {slices.map((slice) => (
          <div key={slice.name}>
            <span>
              <i className="legend-dot" style={{ background: slice.color }} /> {slice.name}
            </span>
            <strong>{usd(slice.value)}</strong>
          </div>
        ))}
        <div>
          <span>
            <i className="legend-dot" style={{ background: CHART_COLORS.down }} /> Debt
          </span>
          <strong className="tone-red">−{usd(value.debt)}</strong>
        </div>
        <div className="quote-list__total">
          <span>Net worth</span>
          <strong className={value.net >= 0 ? "tone-green" : "tone-red"}>{usd(value.net)}</strong>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// 3. Risk gauges
// ============================================================

export function RiskGaugePanel({ protocol }: { protocol: ProtocolApi }) {
  const hfPct = Number(protocol.healthFactorBps) / 100;
  const hasLoan = protocol.hasActiveLoan;
  const healthy = Number.isFinite(hfPct) && hfPct < 1_000_000;

  const ltvPct = Number(protocol.ltvBps) / 100;
  const thresholdPct = Number(protocol.liquidationThresholdBps) / 100;
  const distance = protocol.liquidationDistancePct;

  const hfColor = !hasLoan
    ? CHART_COLORS.axis
    : hfPct >= 150
    ? CHART_COLORS.up
    : hfPct >= 110
    ? CHART_COLORS.warn
    : CHART_COLORS.down;

  const distanceColor =
    distance >= 35 ? CHART_COLORS.up : distance >= 15 ? CHART_COLORS.warn : CHART_COLORS.down;

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <ShieldCheck size={15} /> Risk
          </h3>
          <p>
            Liquidation threshold {thresholdPct.toFixed(0)}% · oracle $
            {protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="gauge-grid">
        <RadialGauge
          value={hasLoan && healthy ? clamp((hfPct / 300) * 100) : 0}
          display={hasLoan && healthy ? `${hfPct.toFixed(0)}%` : "—"}
          label="Health factor"
          color={hfColor}
        />
        <RadialGauge
          value={hasLoan ? clamp(distance) : 0}
          display={hasLoan ? `${distance.toFixed(1)}%` : "—"}
          label="ETH drop buffer"
          color={distanceColor}
        />
        <RadialGauge
          value={hasLoan ? clamp((ltvPct / Math.max(thresholdPct, 1)) * 100) : 0}
          display={hasLoan ? `${ltvPct.toFixed(1)}%` : "—"}
          label="LTV used"
          color={ltvPct >= thresholdPct * 0.9 ? CHART_COLORS.down : CHART_COLORS.primary}
        />
      </div>

      <div className="quote-list tight">
        <div>
          <span>Liquidation price</span>
          <strong className={hasLoan ? "tone-red" : ""}>
            {hasLoan && protocol.liquidationPriceUsd ? usd(protocol.liquidationPriceUsd) : "—"}
          </strong>
        </div>
        <div>
          <span>Collateral posted</span>
          <strong>{protocol.collateralEthAmount.toFixed(4)} ETH</strong>
        </div>
        <div>
          <span>Debt outstanding</span>
          <strong>{formatUsdc(protocol.debt)} USDC</strong>
        </div>
      </div>

      {hasLoan && distance > 0 && distance < 15 && (
        <div className="ticket-hint warn">
          <AlertTriangle size={14} />
          <span>
            ETH only has to fall {distance.toFixed(1)}% to put this loan into liquidation. Add collateral or
            repay part of the debt.
          </span>
        </div>
      )}
    </section>
  );
}

// ============================================================
// 4. ETH candles with YOUR liquidation price on the chart
// ============================================================

export function LiquidationCandlePanel({
  protocol,
  ohlc,
}: {
  protocol: ProtocolApi;
  ohlc: EthOhlc;
}) {
  const { series, status, source } = ohlc;
  const liq = protocol.liquidationPriceUsd;
  const hasLoan = protocol.hasActiveLoan && liq > 0;
  const up = series.change >= 0;

  const refLines: CandleRefLine[] = useMemo(() => {
    const lines: CandleRefLine[] = [
      {
        y: protocol.ethPriceUsd,
        color: CHART_COLORS.primary,
        label: `oracle $${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        position: "insideTopLeft",
      },
    ];
    if (hasLoan) {
      lines.push({
        y: liq,
        color: CHART_COLORS.down,
        dash: "6 4",
        label: `your liquidation $${liq.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        position: "insideBottomLeft",
      });
    }
    return lines;
  }, [hasLoan, liq, protocol.ethPriceUsd]);

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <CandlestickChart size={15} /> ETH / USD vs your liquidation level
          </h3>
          <p className="chart-src-line">
            <span className={`chart-src ${status}`}>
              <i /> {source}
            </span>
            &nbsp;· market ${series.last.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="chart-quote">
          <strong>${protocol.ethPriceUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
          <span className={up ? "tone-green" : "tone-red"}>
            {up ? "▲" : "▼"} {Math.abs(series.change).toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="chart-legend">
        <span>
          <i style={{ background: CHART_COLORS.up }} /> Up candle
        </span>
        <span>
          <i style={{ background: CHART_COLORS.down }} /> Down candle
        </span>
        <span>
          <i style={{ background: CHART_COLORS.warn }} /> MA(7)
        </span>
        <span>
          <i style={{ background: CHART_COLORS.primary }} /> Oracle
        </span>
        {hasLoan && (
          <span>
            <i style={{ background: CHART_COLORS.down }} /> Your liquidation
          </span>
        )}
      </div>

      <CandleChart series={series} height={286} refLines={refLines} />

      {!hasLoan && (
        <p className="chart-footnote">
          Open a loan on the Borrow desk and your own liquidation price gets drawn on this chart.
        </p>
      )}
    </section>
  );
}

// ============================================================
// 5. Debt vs collateral, as recorded
// ============================================================

export function DebtVsCollateralPanel({ rows, ready }: { rows: HistoryRow[]; ready: boolean }) {
  // Thin the history so the bars stay readable — keep the most recent 14 points.
  const bars = useMemo(
    () =>
      rows.slice(-14).map((row) => ({
        name: row.label,
        collateral: Number(row.collateral.toFixed(2)),
        debt: Number(row.debt.toFixed(2)),
      })),
    [rows]
  );

  const latest = bars[bars.length - 1];
  const equity = latest ? latest.collateral - latest.debt : 0;

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <Layers3 size={15} /> Collateral vs debt
          </h3>
          <p>Recorded from live reads · last {bars.length} samples</p>
        </div>
        <div className="chart-quote">
          <strong className={equity >= 0 ? "tone-green" : "tone-red"}>{usd(equity, 0)}</strong>
          <span>equity in the loan</span>
        </div>
      </div>

      {ready && bars.length >= 2 ? (
        <CategoryBars
          data={bars}
          height={244}
          prefix="$"
          showLegend
          series={[
            { key: "collateral", label: "Collateral value", color: CHART_COLORS.teal },
            { key: "debt", label: "Debt", color: CHART_COLORS.down },
          ]}
        />
      ) : (
        <div className="empty-state">Two or more recorded samples are needed to draw this comparison.</div>
      )}
    </section>
  );
}

// ============================================================
// 6. Price ladder — what happens to the loan if ETH moves
// ============================================================

export function PriceLadderPanel({ protocol }: { protocol: ProtocolApi }) {
  const debt = toUsdcNumber(protocol.debt);
  const collateralEth = protocol.collateralEthAmount;
  const spot = protocol.ethPriceUsd;
  const thresholdBps = Number(protocol.liquidationThresholdBps) || 8000;

  const ladder = useMemo(() => {
    if (!collateralEth || !spot) return [];
    return [30, 20, 10, 0, -10, -20, -30].map((move) => {
      const price = spot * (1 + move / 100);
      const borrowCapacity = (collateralEth * price * thresholdBps) / BPS;
      return {
        name: `${move > 0 ? "+" : ""}${move}%  $${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        capacity: Number(borrowCapacity.toFixed(2)),
        debt: Number(debt.toFixed(2)),
        safe: borrowCapacity >= debt,
      };
    });
  }, [collateralEth, debt, spot, thresholdBps]);

  const firstUnsafe = ladder.find((row) => !row.safe);

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <AlertTriangle size={15} /> Price stress ladder
          </h3>
          <p>
            Collateral × {(thresholdBps / 100).toFixed(0)}% liquidation threshold, at ETH prices around spot
          </p>
        </div>
        <div className="chart-quote">
          <strong className={firstUnsafe ? "tone-red" : "tone-green"}>
            {firstUnsafe ? firstUnsafe.name.split("  ")[0] : "safe"}
          </strong>
          <span>{firstUnsafe ? "first unsafe move" : "across this range"}</span>
        </div>
      </div>

      {ladder.length ? (
        <>
          <CategoryBars
            data={ladder}
            height={264}
            layout="vertical"
            prefix="$"
            showLegend
            series={[
              { key: "capacity", label: "Borrow capacity", color: CHART_COLORS.teal },
              { key: "debt", label: "Debt owed", color: CHART_COLORS.down },
            ]}
          />
          <p className="chart-footnote">
            Wherever the red bar is longer than the teal bar, the position is liquidatable at that ETH price.
          </p>
        </>
      ) : (
        <div className="empty-state">No collateral posted, so there is nothing to stress-test.</div>
      )}
    </section>
  );
}

// ============================================================
// 7. Hedge cashflows
// ============================================================

export function HedgePnlPanel({ protocol }: { protocol: ProtocolApi }) {
  const swap = protocol.swap;
  const floatingBps = Number(protocol.borrowRateBps);

  const model = useMemo(() => {
    if (!swap || swap.status !== 1) return null;

    const interval = Number(swap.settlementInterval) || 0;
    const start = Number(swap.startTime) || 0;
    const maturity = Number(swap.maturityTime) || 0;
    const notional = toUsdcNumber(swap.notionalUsdc);
    const fixedBps = Number(swap.fixedRateBps);
    if (!interval || maturity <= start || !notional) return null;

    const total = Math.max(1, Math.floor((maturity - start) / interval));
    const settled = Math.max(0, Math.floor((Number(swap.lastSettlementTime) - start) / interval));

    // Same simple-interest formula the contracts use for each leg.
    const perPeriod = (rateBps: number) => (notional * rateBps * interval) / (BPS * YEAR);
    const fixedLeg = perPeriod(fixedBps);
    const floatingLeg = perPeriod(floatingBps);
    const net = floatingLeg - fixedLeg; // user pays fixed, receives floating

    const shown = Math.min(total, 18);
    const bars = Array.from({ length: shown }, (_, i) => ({
      name: `P${i + 1}${i < settled ? "" : "*"}`,
      value: Number(net.toFixed(4)),
    }));

    return { bars, fixedLeg, floatingLeg, net, total, settled, shown, interval, fixedBps };
  }, [floatingBps, swap]);

  if (!model) {
    return (
      <section className="panel-card chart-card">
        <div className="chart-head">
          <div>
            <h3>
              <Activity size={15} /> Hedge cashflows
            </h3>
            <p>No open interest-rate swap</p>
          </div>
        </div>
        <div className="empty-state">
          Open a hedge from the Swap desk and every settlement period's net cashflow appears here.
        </div>
      </section>
    );
  }

  const favourable = model.net >= 0;
  const lifetime = model.net * model.total;

  return (
    <section className="panel-card chart-card">
      <div className="chart-head">
        <div>
          <h3>
            <Activity size={15} /> Hedge cashflows · swap #{swap!.id.toString()}
          </h3>
          <p>
            Per settlement period at today&apos;s floating rate ({formatBps(protocol.borrowRateBps)}) vs your
            fixed {formatBps(swap!.fixedRateBps)}
          </p>
        </div>
        <div className="chart-quote">
          <strong className={favourable ? "tone-green" : "tone-red"}>
            {favourable ? "+" : "−"}
            {usd(Math.abs(model.net), 4)}
          </strong>
          <span>per period to you</span>
        </div>
      </div>

      <SignedBars data={model.bars} height={210} prefix="$" />

      <div className="quote-list tight" style={{ marginTop: 6 }}>
        <div>
          <span>Fixed leg you pay</span>
          <strong className="tone-red">−{usd(model.fixedLeg, 4)}</strong>
        </div>
        <div>
          <span>Floating leg you receive</span>
          <strong className="tone-green">+{usd(model.floatingLeg, 4)}</strong>
        </div>
        <div>
          <span>Periods settled</span>
          <strong>
            {model.settled} of {model.total}
          </strong>
        </div>
        <div className="quote-list__total">
          <span>If the floating rate held for the whole term</span>
          <strong className={lifetime >= 0 ? "tone-green" : "tone-red"}>
            {lifetime >= 0 ? "+" : "−"}
            {usd(Math.abs(lifetime), 2)}
          </strong>
        </div>
      </div>

      <p className="chart-footnote">
        Bars marked * have not settled yet. The floating rate moves with pool utilization, so realised
        cashflows will differ — this is the shape of the hedge at the rate that is live right now
        {model.shown < model.total ? `, showing the first ${model.shown} of ${model.total} periods` : ""}.
      </p>
    </section>
  );
}
