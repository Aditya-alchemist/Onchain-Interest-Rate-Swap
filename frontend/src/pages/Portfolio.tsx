import React, { useEffect, useMemo } from "react";
import { Bell, ExternalLink, Trash2, Wallet } from "lucide-react";

import LoanCard from "../components/LoanCard";
import StatStrip from "../components/StatStrip";
import {
  CompositionPanel,
  DebtVsCollateralPanel,
  HedgePnlPanel,
  LiquidationCandlePanel,
  PortfolioValuePanel,
  PriceLadderPanel,
  RiskGaugePanel,
} from "../components/PortfolioCharts";
import { useEthOhlc } from "../hooks/useEthOhlc";
import { usePortfolioHistory } from "../hooks/usePortfolioHistory";
import {
  formatBps,
  formatEth,
  formatFactor,
  formatUsdc,
  toUsdcNumber,
  TX,
  useProtocol,
} from "../hooks/useProtocol";
import { etherscanTx, noticeIcon, relativeTime, shortHash, useNotifications } from "../lib/notifications";

export default function Portfolio() {
  const protocol = useProtocol();
  const notifications = useNotifications();
  const ohlc = useEthOhlc(protocol.ethPriceUsd);

  const value = protocol.portfolioValueUsd;
  const hfPct = Number(protocol.healthFactorBps) / 100;

  // Real, recorded history of this wallet's balances — see usePortfolioHistory.
  const history = usePortfolioHistory({
    address: protocol.address,
    lastUpdated: protocol.lastUpdated,
    wallet: value.wallet,
    supplied: value.supplied,
    escrow: value.escrow,
    collateral: value.collateral,
    debt: value.debt,
    net: value.net,
    eth: protocol.ethPriceUsd,
    hf: Number.isFinite(hfPct) && hfPct < 1_000_000 ? hfPct : 0,
  });

  // Being on this page means the feed is visible, so nothing here is "unread" —
  // re-run as entries arrive so the bell badge does not build up behind us.
  const { markFeedRead } = notifications;
  const feedSize = notifications.feed.length;
  useEffect(() => {
    markFeedRead();
  }, [feedSize, markFeedRead]);

  const loanCard = useMemo(() => {
    if (!protocol.loan) return null;
    const healthFactor = Number.isFinite(hfPct) && hfPct < 100000 ? hfPct : undefined;
    return {
      id: protocol.loan.tokenId.toString(),
      borrower: protocol.address,
      principal: toUsdcNumber(protocol.loan.principalUsdc),
      collateral: Number(formatEth(protocol.loan.collateralEth).replace(/,/g, "")),
      healthFactor,
      interestRate: Number(protocol.loan.borrowRateBps) / 100,
      hasHedge: Boolean(protocol.swapId),
      status: protocol.healthFactorBps < BigInt(10000) ? ("liquidatable" as const) : ("healthy" as const),
    };
  }, [hfPct, protocol.address, protocol.healthFactorBps, protocol.loan, protocol.swapId]);

  return (
    <div className="portfolio-page">
      {/* ============ HEADER + KPIs ============ */}
      <section className="hero-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">PORTFOLIO</span>
            <h1>Your HedgeFi positions</h1>
          </div>
          <div className="header-chips">
            <div className="price-chip">
              <span>Net worth</span>
              <strong className={value.net >= 0 ? "tone-green" : "tone-red"}>
                ${value.net.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </strong>
            </div>
            {protocol.address && (
              <a
                className="ghost-link"
                href={`https://sepolia.etherscan.io/address/${protocol.address}`}
                target="_blank"
                rel="noreferrer"
              >
                Etherscan <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>

        <StatStrip
          items={[
            { label: "USDC wallet", value: `${formatUsdc(protocol.usdcBalance)} USDC`, tone: "green" },
            { label: "Pool supplied", value: `${formatUsdc(protocol.poolDeposit)} USDC`, tone: "blue" },
            {
              label: "Escrow total",
              value: `${formatUsdc(protocol.escrowAvailable + protocol.escrowLocked)} USDC`,
              tone: "amber",
            },
            { label: "Debt", value: `${formatUsdc(protocol.debt)} USDC`, tone: "red" },
          ]}
        />

        {loanCard ? (
          <LoanCard
            loan={loanCard}
            busy={protocol.isBusy(TX.repay)}
            onRepay={() => protocol.repay().catch(() => {})}
          />
        ) : (
          <div className="empty-state">
            No active loan position. Open one from the Borrow desk to see it here.
          </div>
        )}
      </section>

      {/* ============ VALUE + COMPOSITION ============ */}
      <div className="portfolio-charts">
        <PortfolioValuePanel
          rows={history.rows}
          ready={history.ready}
          netChange={history.netChange}
          netChangePct={history.netChangePct}
          windowStart={history.windowStart}
          net={value.net}
        />
        <CompositionPanel protocol={protocol} />
      </div>

      {/* ============ ETH CANDLES + RISK ============ */}
      <div className="portfolio-charts">
        <LiquidationCandlePanel protocol={protocol} ohlc={ohlc} />
        <RiskGaugePanel protocol={protocol} />
      </div>

      {/* ============ BARS: HISTORY + STRESS ============ */}
      <div className="portfolio-charts even">
        <DebtVsCollateralPanel rows={history.rows} ready={history.ready} />
        <PriceLadderPanel protocol={protocol} />
      </div>

      {/* ============ HEDGE + EXPOSURE + ACTIVITY ============ */}
      <div className="portfolio-charts">
        <HedgePnlPanel protocol={protocol} />

        <div className="right-stack">
          <section className="panel-card">
            <div className="panel-header compact">
              <h2>Exposure</h2>
              <Wallet size={16} />
            </div>
            <div className="quote-list tight">
              <div>
                <span>Loan token</span>
                <strong>{protocol.loan ? `#${protocol.loan.tokenId}` : "None"}</strong>
              </div>
              <div>
                <span>Health factor</span>
                <strong className={protocol.healthFactorBps < BigInt(11000) ? "tone-red" : "tone-green"}>
                  {formatFactor(protocol.healthFactorBps, protocol.hasActiveLoan)}
                </strong>
              </div>
              <div>
                <span>LTV</span>
                <strong>{formatFactor(protocol.ltvBps, protocol.hasActiveLoan)}</strong>
              </div>
              <div>
                <span>Swap ID</span>
                <strong>{protocol.swapId ? `#${protocol.swapId}` : "None"}</strong>
              </div>
              <div>
                <span>Swap NFT</span>
                <strong>{protocol.swapTokenId ? `#${protocol.swapTokenId}` : "None"}</strong>
              </div>
              <div>
                <span>Borrow rate</span>
                <strong>{formatBps(protocol.loan?.borrowRateBps)}</strong>
              </div>
              <div>
                <span>Escrow locked</span>
                <strong>{formatUsdc(protocol.escrowLocked)} USDC</strong>
              </div>
            </div>
          </section>

          {/* ---- Activity feed ---- */}
          <section className="panel-card activity-panel">
            <div className="panel-header compact">
              <h2>
                <Bell size={15} /> Activity
              </h2>
              {notifications.feed.length > 0 && (
                <button
                  type="button"
                  className="ghost-link"
                  onClick={notifications.clearFeed}
                  title="Clear activity"
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>

            {notifications.feed.length ? (
              <ul className="activity-feed">
                {notifications.feed.map((item) => (
                  <li key={item.id} className={`activity-item is-${item.kind}`}>
                    <span className="activity-item__icon">{noticeIcon(item.kind, 15)}</span>
                    <div className="activity-item__body">
                      <strong>{item.title}</strong>
                      {item.message && <span>{item.message}</span>}
                      <div className="activity-item__meta">
                        <span>{relativeTime(item.ts)}</span>
                        {item.hash && (
                          <a href={etherscanTx(item.hash)} target="_blank" rel="noreferrer">
                            {shortHash(item.hash)} <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                No activity yet. Every transaction you send — supply, borrow, repay, hedge, settle — is
                recorded here with its Etherscan link.
              </div>
            )}

            {history.samples.length > 0 && (
              <button
                type="button"
                className="ghost-link activity-panel__reset"
                onClick={history.clear}
                title="Delete the recorded value history for this wallet"
              >
                <Trash2 size={13} /> Reset recorded history ({history.samples.length} samples)
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
